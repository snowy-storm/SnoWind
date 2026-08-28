import { Button, LoadingOverlay, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MindMapCanvasHandle } from "@/features/mindmap/mindmap-canvas";
import { MindmapEditor } from "@/features/mindmap/mindmap-editor";
import { MindmapExportMenu } from "@/features/mindmap/mindmap-export-menu";
import { captureMindmapPayload } from "@/features/mindmap/mindmap-save";
import { usePersistDrawing } from "@/features/drawing/hooks/use-persist-drawing.ts";
import { getDrawingAttrs } from "@/features/drawing/drawing-content.ts";
import { DrawingPreview } from "./drawing-preview";
import { getFileUrl } from "@/lib/config.ts";

type DrawingMindmapProps = {
  pageId: string;
  content: unknown;
  editable: boolean;
};

export function DrawingMindmap({
  pageId,
  content,
  editable,
}: DrawingMindmapProps) {
  const { t } = useTranslation();
  const persistDrawing = usePersistDrawing(pageId);
  const canvasRef = useRef<MindMapCanvasHandle>(null);
  const attrs = getDrawingAttrs(content, "mindmap");
  const [previewSrc, setPreviewSrc] = useState<string | undefined>(attrs.src);
  const [editing, { open, close }] = useDisclosure(false);
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const attachmentIdRef = useRef<string | undefined>(attrs.attachmentId);
  const dataRef = useRef<unknown>(attrs.data);

  useEffect(() => {
    setPreviewSrc(attrs.src);
    attachmentIdRef.current = attrs.attachmentId;
    dataRef.current = attrs.data;
  }, [attrs.src, attrs.attachmentId, attrs.data]);

  const handleOpen = useCallback(() => {
    if (!editable) return;
    isDirtyRef.current = false;
    open();
  }, [editable, open]);

  const saveData = useCallback(async () => {
    if (!canvasRef.current || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const payload = await captureMindmapPayload(
        canvasRef.current,
        pageId,
        attachmentIdRef.current,
      );
      if (payload.attachmentId) {
        attachmentIdRef.current = payload.attachmentId;
      }
      dataRef.current = payload.data;
      await persistDrawing("mindmap", payload);
      if (payload.src) setPreviewSrc(payload.src);
      isDirtyRef.current = false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [pageId, persistDrawing]);

  const handleSaveAndExit = useCallback(async () => {
    try {
      await saveData();
      close();
    } catch {
      /* keep editor open */
    }
  }, [close, saveData]);

  const handleClose = useCallback(() => {
    if (!isDirtyRef.current) {
      close();
      return;
    }

    modals.openConfirmModal({
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

  const handleDownload = useCallback(() => {
    if (!previewSrc) return;
    const a = document.createElement("a");
    a.href = getFileUrl(previewSrc);
    a.download = "mindmap.svg";
    a.click();
  }, [previewSrc]);

  useEffect(() => {
    if (!editing) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && !isSavingRef.current) {
        saveData().catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [editing, saveData]);

  if (!editing) {
    return (
      <DrawingPreview
        src={previewSrc}
        emptyLabel={t("Double-click to edit mind map")}
        editable={editable}
        onEdit={handleOpen}
        onDownload={handleDownload}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
    >
      <LoadingOverlay visible={isSaving} />
      <MindmapEditor
        canvasRef={canvasRef}
        initialData={dataRef.current}
        onChange={() => {
          isDirtyRef.current = true;
        }}
        actions={
          <>
            <MindmapExportMenu canvasRef={canvasRef} />
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
      />
    </div>
  );
}
