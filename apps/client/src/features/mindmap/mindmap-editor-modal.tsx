import {
  Button,
  LoadingOverlay,
  Modal,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MindMapCanvasHandle } from "./mindmap-canvas";
import { MindmapEditor } from "./mindmap-editor";
import { MindmapExportMenu } from "./mindmap-export-menu";
import { captureMindmapPayload, type MindmapSavePayload } from "./mindmap-save";

export type { MindmapSavePayload };

type MindmapEditorModalProps = {
  opened: boolean;
  onClose: () => void;
  initialData?: unknown;
  pageId?: string;
  attachmentId?: string;
  onSave: (payload: MindmapSavePayload) => Promise<void> | void;
};

export function MindmapEditorModal({
  opened,
  onClose,
  initialData,
  pageId,
  attachmentId,
  onSave,
}: MindmapEditorModalProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<MindMapCanvasHandle>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isDirtyRef = useRef(false);

  const handleClose = useCallback(() => {
    if (!isDirtyRef.current) {
      onClose();
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
        onClose();
      },
    });
  }, [onClose, t]);

  const handleSave = useCallback(async () => {
    if (!canvasRef.current || isSaving) return;
    setIsSaving(true);
    try {
      const payload = await captureMindmapPayload(
        canvasRef.current,
        pageId,
        attachmentId,
      );
      await onSave(payload);
      isDirtyRef.current = false;
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [attachmentId, isSaving, onClose, onSave, pageId]);

  return (
    <Modal.Root
      opened={opened}
      onClose={handleClose}
      fullScreen
      closeOnEscape={false}
      trapFocus={false}
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Body p={0} pos="relative" style={{ height: "100vh" }}>
          <LoadingOverlay visible={isSaving} />
          {opened && (
            <MindmapEditor
              canvasRef={canvasRef}
              initialData={initialData}
              onChange={() => {
                isDirtyRef.current = true;
              }}
              actions={
                <>
                  <MindmapExportMenu canvasRef={canvasRef} />
                  <Button
                    size="compact-sm"
                    onClick={handleSave}
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
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
