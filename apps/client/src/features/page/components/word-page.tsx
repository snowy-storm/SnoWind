import { Button, Text } from "@mantine/core";
import { IconDownload, IconFileTypeDocx, IconPencil, IconWindowMaximize } from "@tabler/icons-react";
import { saveAs } from "file-saver";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getFileUrl, isOnlyOfficeEnabled } from "@/lib/config.ts";
import { getPageFileFromContent } from "@/features/page/page.utils";
import { OnlyOfficeEditor } from "@/features/onlyoffice/onlyoffice-editor";
import { getShareAttachmentJwt } from "@/features/onlyoffice/onlyoffice.utils";
import { DrawingEditorModal } from "@/features/drawing/components/drawing-editor-modal";
import {
  FilePageHeader,
  type FilePagePerson,
} from "@/features/page/components/file-page-header";
import { queryClient } from "@/main";
import classes from "./pdf-page.module.css";

type WordPageProps = {
  title: string;
  content: unknown;
  pageId?: string;
  slugId?: string;
  spaceSlug?: string;
  spaceId?: string;
  editable?: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  creator?: FilePagePerson;
  lastUpdatedBy?: FilePagePerson;
};

type ModalMode = "view" | "edit";

export function WordPage({
  title,
  content,
  pageId,
  slugId,
  spaceSlug,
  editable = false,
  createdAt,
  updatedAt,
  creator,
  lastUpdatedBy,
}: WordPageProps) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");
  const [previewKey, setPreviewKey] = useState(0);

  const file = useMemo(() => getPageFileFromContent(content), [content]);
  const previewUrl = file?.src ? getFileUrl(file.src) : null;
  const downloadName = file?.name || `${title || "document"}.docx`;
  const officeEnabled = isOnlyOfficeEnabled();
  const shareJwt = getShareAttachmentJwt(file?.src);
  const canOpenOffice = Boolean(file?.attachmentId && officeEnabled);
  const canEditDocument = editable && canOpenOffice;

  const officeRequest = file?.attachmentId
    ? {
        attachmentId: file.attachmentId,
        fileName: downloadName,
        shareJwt,
      }
    : null;

  const handleDownload = async () => {
    if (!previewUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(previewUrl, { credentials: "include" });
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

  const refreshAfterEdit = () => {
    setPreviewKey((key) => key + 1);
    if (pageId) {
      queryClient.invalidateQueries({ queryKey: ["pages", pageId] });
    }
    if (slugId) {
      queryClient.invalidateQueries({ queryKey: ["pages", slugId] });
    }
  };

  const openPopup = (mode: ModalMode) => {
    setModalMode(mode);
    setPopupOpen(true);
  };

  const closePopup = () => {
    const wasEditing = modalMode === "edit";
    setPopupOpen(false);
    setModalMode("view");
    if (wasEditing) {
      refreshAfterEdit();
    }
  };

  return (
    <div className={classes.root}>
      <FilePageHeader
        title={title}
        pageId={pageId}
        slugId={slugId}
        spaceSlug={spaceSlug}
        editable={editable}
        createdAt={createdAt}
        updatedAt={updatedAt}
        creator={creator}
        lastUpdatedBy={lastUpdatedBy}
        actions={
          <>
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconWindowMaximize size={16} />}
              onClick={() => openPopup("view")}
              disabled={!canOpenOffice || popupOpen}
            >
              {t("Open in window")}
            </Button>
            {canEditDocument && (
              <Button
                variant="default"
                size="compact-sm"
                leftSection={<IconPencil size={16} />}
                onClick={() => openPopup("edit")}
                disabled={popupOpen}
              >
                {t("Edit")}
              </Button>
            )}
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownload}
              disabled={!previewUrl}
              loading={downloading}
            >
              {t("Download")}
            </Button>
          </>
        }
      />

      <div className={classes.preview}>
        {canOpenOffice && officeRequest && !popupOpen ? (
          <OnlyOfficeEditor
            key={previewKey}
            request={{ ...officeRequest, mode: "view" }}
          />
        ) : popupOpen ? (
          <div className={classes.error}>
            <IconFileTypeDocx size={40} stroke={1.4} />
            <Text size="sm" c="dimmed">
              {t("Opened in a window")}
            </Text>
          </div>
        ) : (
          <div className={classes.error}>
            <IconFileTypeDocx size={40} stroke={1.4} />
            <Text size="sm" c="dimmed">
              {!file?.attachmentId
                ? t("Failed to load Word document")
                : t("OnlyOffice is not configured")}
            </Text>
          </div>
        )}
      </div>

      {officeRequest && (
        <DrawingEditorModal
          opened={popupOpen}
          onClose={closePopup}
          title={downloadName}
          defaultMaximized={false}
          closeOnClickOutside
          actions={
            <Button size="compact-sm" variant="default" onClick={closePopup}>
              {t(modalMode === "edit" ? "Exit edit" : "Close")}
            </Button>
          }
        >
          <OnlyOfficeEditor
            key={`${modalMode}-${previewKey}`}
            request={{ ...officeRequest, mode: modalMode }}
          />
        </DrawingEditorModal>
      )}
    </div>
  );
}
