import {
  Button,
  Text,
  useComputedColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconDownload } from "@tabler/icons-react";
import {
  DrawIoEmbed,
  DrawIoEmbedRef,
  EventExport,
  EventSave,
} from "react-drawio";
import { uploadFile } from "@/features/page/services/page-service.ts";
import { getDrawioUrl, getFileUrl } from "@/lib/config.ts";
import {
  DRAWIO_EDITOR_CONFIGURATION,
  getDrawioUrlParameters,
} from "@/features/editor/components/drawio/drawio-embed-options";
import { decodeBase64ToSvgString, svgStringToFile } from "@/lib/utils";
import { IAttachment } from "@/features/attachments/types/attachment.types";
import { usePersistDrawing } from "@/features/drawing/hooks/use-persist-drawing.ts";
import { getDrawingAttrs } from "@/features/drawing/drawing-content.ts";
import { DrawingEditorModal } from "./drawing-editor-modal";
import { DrawingPreview } from "./drawing-preview";

type DrawingDrawioProps = {
  pageId: string;
  content: unknown;
  editable: boolean;
};

export function DrawingDrawio({
  pageId,
  content,
  editable,
}: DrawingDrawioProps) {
  const { t } = useTranslation();
  const persistDrawing = usePersistDrawing(pageId);
  const computedColorScheme = useComputedColorScheme();
  const attrs = getDrawingAttrs(content, "drawio");
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(attrs.src);
  const [editing, { open, close }] = useDisclosure(false);
  const drawioRef = useRef<DrawIoEmbedRef>(null);
  const [initialXML, setInitialXML] = useState<string>("");
  const [isOpening, setIsOpening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const pendingExitRef = useRef(false);
  const attachmentIdRef = useRef<string | undefined>(attrs.attachmentId);

  useEffect(() => {
    setPreviewSrc(attrs.src);
    attachmentIdRef.current = attrs.attachmentId;
  }, [attrs.src, attrs.attachmentId]);

  const handleOpen = useCallback(async () => {
    if (!editable) return;
    isDirtyRef.current = false;
    pendingExitRef.current = false;

    if (!previewSrc) {
      setInitialXML("");
      open();
      return;
    }

    setIsOpening(true);
    try {
      const request = await fetch(getFileUrl(previewSrc), {
        credentials: "include",
        cache: "no-store",
      });
      const blob = await request.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        setInitialXML((reader.result || "") as string);
        setIsOpening(false);
        open();
      };
    } catch (err) {
      console.error(err);
      setInitialXML("");
      setIsOpening(false);
      open();
    }
  }, [editable, open, previewSrc]);

  const saveData = useCallback(
    async (svgXml: string) => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setIsSaving(true);
      try {
        const svgString = decodeBase64ToSvgString(svgXml);
        const fileName = "diagram.drawio.svg";
        const file = await svgStringToFile(svgString, fileName);
        const attachmentId = attachmentIdRef.current;
        const attachment: IAttachment = attachmentId
          ? await uploadFile(file, pageId, attachmentId)
          : await uploadFile(file, pageId);

        attachmentIdRef.current = attachment.id;
        const src = `/api/files/${attachment.id}/${attachment.fileName}?t=${new Date(attachment.updatedAt).getTime()}`;
        await persistDrawing("drawio", {
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
    },
    [pageId, persistDrawing],
  );

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

  const handleSaveAndExit = useCallback(() => {
    pendingExitRef.current = true;
    drawioRef.current?.exportDiagram({ format: "xmlsvg" });
  }, []);

  const handleDownload = useCallback(() => {
    if (previewSrc) {
      const a = document.createElement("a");
      a.href = getFileUrl(previewSrc);
      a.download = "diagram.drawio.svg";
      a.click();
      return;
    }
    drawioRef.current?.exportDiagram({ format: "xmlsvg" });
  }, [previewSrc]);

  useEffect(() => {
    if (!editing) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && !isSavingRef.current && drawioRef.current) {
        drawioRef.current.exportDiagram({ format: "xmlsvg" });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [editing]);

  return (
    <>
      <DrawingPreview
        src={previewSrc}
        emptyLabel={t("Double-click to edit Draw.io diagram")}
        editable={editable}
        onEdit={() => handleOpen().catch(() => {})}
        onDownload={handleDownload}
        isOpening={isOpening}
      />
      <DrawingEditorModal
        opened={editing}
        onClose={handleClose}
        title="Draw.io"
        isSaving={isSaving}
        actions={
          <>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownload}
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
        <DrawIoEmbed
          ref={drawioRef}
          xml={initialXML}
          baseUrl={getDrawioUrl() || undefined}
          autosave
          configuration={DRAWIO_EDITOR_CONFIGURATION}
          urlParameters={getDrawioUrlParameters(computedColorScheme, false)}
          onSave={(data: EventSave) => {
            if (data.parentEvent !== "save") return;
            saveData(data.xml).catch(() => {});
          }}
          onAutoSave={() => {
            isDirtyRef.current = true;
          }}
          onExport={(data: EventExport) => {
            saveData(data.data)
              .then(() => {
                if (pendingExitRef.current) {
                  pendingExitRef.current = false;
                  close();
                }
              })
              .catch(() => {
                pendingExitRef.current = false;
              });
          }}
        />
      </DrawingEditorModal>
    </>
  );
}
