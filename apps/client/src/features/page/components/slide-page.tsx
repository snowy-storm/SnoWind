import { Button, Text } from "@mantine/core";
import {
  IconDownload,
  IconFileTypePpt,
  IconPencil,
  IconWindowMaximize,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getFileUrl, isOnlyOfficeEnabled } from "@/lib/config.ts";
import { getPageFileFromContent } from "@/features/page/page.utils";
import { OnlyOfficeEditor } from "@/features/onlyoffice/onlyoffice-editor";
import { useOnlyOfficeFileSession } from "@/features/onlyoffice/use-onlyoffice-file-session";
import { getShareAttachmentJwt } from "@/features/onlyoffice/onlyoffice.utils";
import { DrawingEditorModal } from "@/features/drawing/components/drawing-editor-modal";
import {
  FilePageHeader,
  type FilePagePerson,
} from "@/features/page/components/file-page-header";
import classes from "./pdf-page.module.css";

type SlidePageProps = {
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

export function SlidePage({
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
}: SlidePageProps) {
  const { t } = useTranslation();
  const {
    editorRef,
    popupOpen,
    modalMode,
    saving,
    previewKey,
    downloading,
    openPopup,
    closePopup,
    downloadFile,
  } = useOnlyOfficeFileSession({ pageId, slugId });

  const file = useMemo(() => getPageFileFromContent(content), [content]);
  const previewUrl = file?.src ? getFileUrl(file.src) : null;
  const downloadName = file?.name || `${title || "slides"}.pptx`;
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
              onClick={() => void downloadFile(previewUrl, downloadName)}
              disabled={!previewUrl || saving}
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
            <IconFileTypePpt size={40} stroke={1.4} />
            <Text size="sm" c="dimmed">
              {t("Opened in a window")}
            </Text>
          </div>
        ) : (
          <div className={classes.error}>
            <IconFileTypePpt size={40} stroke={1.4} />
            <Text size="sm" c="dimmed">
              {!file?.attachmentId
                ? t("Failed to load slides")
                : t("OnlyOffice is not configured")}
            </Text>
          </div>
        )}
      </div>

      {officeRequest && (
        <DrawingEditorModal
          opened={popupOpen}
          onClose={() => void closePopup()}
          title={downloadName}
          isSaving={saving}
          defaultMaximized={false}
          closeOnClickOutside={!saving}
          actions={
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => void closePopup()}
              loading={saving}
              disabled={saving}
            >
              {t(modalMode === "edit" ? "Exit edit" : "Close")}
            </Button>
          }
        >
          <OnlyOfficeEditor
            ref={editorRef}
            key={`${modalMode}-${previewKey}`}
            request={{ ...officeRequest, mode: modalMode }}
          />
        </DrawingEditorModal>
      )}
    </div>
  );
}
