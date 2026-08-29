import { Button, Text } from "@mantine/core";
import { IconDownload, IconFileTypePdf, IconWindowMaximize } from "@tabler/icons-react";
import { saveAs } from "file-saver";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getFileUrl } from "@/lib/config.ts";
import { getPdfFileFromPageContent } from "@/features/page/page.utils";
import {
  FilePageHeader,
  type FilePagePerson,
} from "@/features/page/components/file-page-header";
import { DrawingEditorModal } from "@/features/drawing/components/drawing-editor-modal";
import classes from "./pdf-page.module.css";

type PdfPageProps = {
  title: string;
  content: unknown;
  pageId?: string;
  slugId?: string;
  spaceSlug?: string;
  editable?: boolean;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  creator?: FilePagePerson;
  lastUpdatedBy?: FilePagePerson;
};

export function PdfPage({
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
}: PdfPageProps) {
  const { t } = useTranslation();
  const [hasError, setHasError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const file = useMemo(() => getPdfFileFromPageContent(content), [content]);
  const previewUrl = file?.src ? getFileUrl(file.src) : null;
  const downloadName = file?.name || `${title || "document"}.pdf`;

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

  const previewFrame = previewUrl && !hasError ? (
    <iframe
      className={classes.iframe}
      src={previewUrl}
      title={downloadName}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  ) : (
    <div className={classes.error}>
      <IconFileTypePdf size={40} stroke={1.4} />
      <Text size="sm" c="dimmed">
        {t("Failed to load PDF")}
      </Text>
    </div>
  );

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
              onClick={() => setPopupOpen(true)}
              disabled={!previewUrl || hasError || popupOpen}
            >
              {t("Open in window")}
            </Button>
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
        {popupOpen ? (
          <div className={classes.error}>
            <IconFileTypePdf size={40} stroke={1.4} />
            <Text size="sm" c="dimmed">
              {t("Opened in a window")}
            </Text>
          </div>
        ) : (
          previewFrame
        )}
      </div>

      <DrawingEditorModal
        opened={popupOpen}
        onClose={() => setPopupOpen(false)}
        title={downloadName}
        defaultMaximized={false}
        closeOnClickOutside
        actions={
          <Button size="compact-sm" variant="default" onClick={() => setPopupOpen(false)}>
            {t("Close")}
          </Button>
        }
      >
        {previewFrame}
      </DrawingEditorModal>
    </div>
  );
}
