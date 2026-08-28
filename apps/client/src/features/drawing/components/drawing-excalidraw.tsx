import {
  Button,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useDisclosure } from "@mantine/hooks";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { IconDownload } from "@tabler/icons-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useHandleLibrary } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { svgStringToFile } from "@/lib";
import { getFileUrl } from "@/lib/config.ts";
import { localStorageLibraryAdapter } from "@/features/editor/components/excalidraw/excalidraw-utils.ts";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import { usePersistDrawing } from "@/features/drawing/hooks/use-persist-drawing.ts";
import { getDrawingAttrs } from "@/features/drawing/drawing-content.ts";
import { DrawingEditorModal } from "./drawing-editor-modal";
import { DrawingPreview } from "./drawing-preview";

const ExcalidrawComponent = lazy(() =>
  import("@excalidraw/excalidraw").then((module) => ({
    default: module.Excalidraw,
  })),
);

type DrawingExcalidrawProps = {
  pageId: string;
  content: unknown;
  editable: boolean;
};

export function DrawingExcalidraw({
  pageId,
  content,
  editable,
}: DrawingExcalidrawProps) {
  const { t } = useTranslation();
  const persistDrawing = usePersistDrawing(pageId);
  const computedColorScheme = useComputedColorScheme();
  const attrs = getDrawingAttrs(content, "excalidraw");
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(attrs.src);
  const [editing, { open, close }] = useDisclosure(false);
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI>(null);
  useHandleLibrary({
    excalidrawAPI,
    adapter: localStorageLibraryAdapter,
  });
  const [excalidrawData, setExcalidrawData] = useState<any>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const isInitialLoadRef = useRef(true);
  const lastFingerprintRef = useRef("");
  const attachmentIdRef = useRef<string | undefined>(attrs.attachmentId);

  useEffect(() => {
    setPreviewSrc(attrs.src);
    attachmentIdRef.current = attrs.attachmentId;
  }, [attrs.src, attrs.attachmentId]);

  const handleOpen = useCallback(async () => {
    if (!editable) return;

    isDirtyRef.current = false;
    isInitialLoadRef.current = true;
    lastFingerprintRef.current = "";
    setExcalidrawAPI(null);

    if (!previewSrc) {
      setExcalidrawData(null);
      open();
      return;
    }

    setIsOpening(true);
    try {
      const request = await fetch(getFileUrl(previewSrc), {
        credentials: "include",
        cache: "no-store",
      });
      const { loadFromBlob } = await import("@excalidraw/excalidraw");
      const data = await loadFromBlob(await request.blob(), null, null);
      setExcalidrawData(data);
      open();
    } catch (err) {
      console.error(err);
      setExcalidrawData(null);
      open();
    } finally {
      setIsOpening(false);
    }
  }, [editable, open, previewSrc]);

  const saveData = useCallback(async () => {
    if (!excalidrawAPI || isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const svg = await exportToSvg({
        elements: excalidrawAPI.getSceneElements(),
        appState: {
          exportEmbedScene: true,
          exportWithDarkMode: false,
        },
        files: excalidrawAPI.getFiles(),
      });

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svg);
      svgString = svgString.replace(
        /https:\/\/unpkg\.com\/@excalidraw\/excalidraw@undefined/g,
        "https://unpkg.com/@excalidraw/excalidraw@latest",
      );

      const fileName = "diagram.excalidraw.svg";
      const file = await svgStringToFile(svgString, fileName);
      const attachmentId = attachmentIdRef.current;
      const attachment: IAttachment = attachmentId
        ? await uploadFile(file, pageId, attachmentId)
        : await uploadFile(file, pageId);

      attachmentIdRef.current = attachment.id;
      const src = `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`;
      await persistDrawing("excalidraw", {
        src,
        title: attachment.fileName,
        size: attachment.fileSize,
        attachmentId: attachment.id,
      });
      setPreviewSrc(src);
      isDirtyRef.current = false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [excalidrawAPI, pageId, persistDrawing]);

  const handleSaveAndExit = useCallback(async () => {
    try {
      await saveData();
      close();
    } catch {
      /* keep editor open */
    }
  }, [saveData, close]);

  const handleClose = useCallback(() => {
    if (!isDirtyRef.current) {
      close();
      return;
    }

    modals.openConfirmModal({
      zIndex: 400,
      title: t("Unsaved changes"),
      children: (
        <Text size="sm">
          {t("You have unsaved changes that will be lost.")}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Discard"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        isDirtyRef.current = false;
        close();
      },
    });
  }, [close, t]);

  const handleDownload = useCallback(async () => {
    if (editing && excalidrawAPI) {
      const { exportToSvg } = await import("@excalidraw/excalidraw");
      const svg = await exportToSvg({
        elements: excalidrawAPI.getSceneElements(),
        appState: { exportEmbedScene: true, exportWithDarkMode: false },
        files: excalidrawAPI.getFiles(),
      });
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "diagram.excalidraw.svg";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (!previewSrc) return;
    const a = document.createElement("a");
    a.href = getFileUrl(previewSrc);
    a.download = "diagram.excalidraw.svg";
    a.click();
  }, [editing, excalidrawAPI, previewSrc]);

  useEffect(() => {
    if (!editing) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && !isSavingRef.current) {
        saveData().catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [editing, saveData]);

  return (
    <>
      <DrawingPreview
        src={previewSrc}
        emptyLabel={t("Double-click to edit Excalidraw diagram")}
        editable={editable}
        onEdit={() => handleOpen().catch(() => {})}
        onDownload={() => handleDownload().catch(() => {})}
        isOpening={isOpening}
      />
      <DrawingEditorModal
        opened={editing}
        onClose={handleClose}
        title="Excalidraw"
        isSaving={isSaving}
        actions={
          <>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={() => handleDownload().catch(() => {})}
            >
              {t("Download")}
            </Button>
            <Button
              size="compact-sm"
              onClick={handleSaveAndExit}
              loading={isSaving}
            >
              {t("Save & Exit")}
            </Button>
            <Button size="compact-sm" color="red" onClick={handleClose}>
              {t("Exit")}
            </Button>
          </>
        }
      >
        <Suspense fallback={null}>
          <ExcalidrawComponent
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            isCollaborating={false}
            onChange={(elements, _appState, files) => {
              const fingerprint = `${elements.length}:${elements.reduce((s, e) => s + (e.version || 0), 0)}:${Object.keys(files).length}`;
              if (isInitialLoadRef.current) {
                lastFingerprintRef.current = fingerprint;
                isInitialLoadRef.current = false;
                return;
              }
              if (fingerprint !== lastFingerprintRef.current) {
                lastFingerprintRef.current = fingerprint;
                isDirtyRef.current = true;
              }
            }}
            initialData={{
              ...excalidrawData,
              scrollToContent: true,
            }}
            theme={computedColorScheme}
          />
        </Suspense>
      </DrawingEditorModal>
    </>
  );
}
