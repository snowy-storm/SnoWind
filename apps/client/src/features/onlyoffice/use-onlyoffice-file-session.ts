import { notifications } from "@mantine/notifications";
import { saveAs } from "file-saver";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/main";
import type { OnlyOfficeEditorHandle } from "./onlyoffice-editor";

export type OfficeModalMode = "view" | "edit";

export function useOnlyOfficeFileSession(opts: {
  pageId?: string;
  slugId?: string;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<OnlyOfficeEditorHandle>(null);
  const closingRef = useRef(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [modalMode, setModalMode] = useState<OfficeModalMode>("view");
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const refreshAfterEdit = () => {
    setPreviewKey((key) => key + 1);
    if (opts.pageId) {
      queryClient.invalidateQueries({ queryKey: ["pages", opts.pageId] });
    }
    if (opts.slugId) {
      queryClient.invalidateQueries({ queryKey: ["pages", opts.slugId] });
    }
  };

  const flushEditor = async () => {
    await editorRef.current?.flush();
  };

  const openPopup = (mode: OfficeModalMode) => {
    setModalMode(mode);
    setPopupOpen(true);
  };

  const closePopup = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const wasEditing = modalMode === "edit";
    try {
      if (wasEditing) {
        setSaving(true);
        try {
          await flushEditor();
        } catch {
          notifications.show({
            message: t("Failed to save document"),
            color: "red",
          });
          return;
        } finally {
          setSaving(false);
        }
      }
      setPopupOpen(false);
      setModalMode("view");
      if (wasEditing) {
        refreshAfterEdit();
      }
    } finally {
      closingRef.current = false;
    }
  };

  const downloadFile = async (previewUrl: string | null, downloadName: string) => {
    if (!previewUrl) return;
    setDownloading(true);
    try {
      if (popupOpen && modalMode === "edit") {
        await flushEditor();
      }
      const response = await fetch(previewUrl, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("download failed");
      }
      const blob = await response.blob();
      saveAs(blob, downloadName);
    } catch {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  return {
    editorRef,
    popupOpen,
    modalMode,
    saving,
    previewKey,
    downloading,
    openPopup,
    closePopup,
    downloadFile,
  };
}
