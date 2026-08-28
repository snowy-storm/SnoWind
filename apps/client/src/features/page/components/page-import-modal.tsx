import {
  Modal,
  Button,
  SimpleGrid,
  FileButton,
  Group,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconCheck,
  IconFileCode,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeZip,
  IconMarkdown,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import {
  importPage,
  importZip,
} from "@/features/page/services/page-service.ts";
import { importTable } from "@/ee/base/services/base-service.ts";
import { readSpreadsheetSheetNames } from "@/features/page/utils/read-spreadsheet-sheets.ts";
import { notifications } from "@mantine/notifications";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useAtom } from "jotai";
import { buildTree } from "@/features/page/tree/utils";
import { IPage } from "@/features/page/types/page.types.ts";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfluenceIcon } from "@/components/icons/confluence-icon.tsx";
import { getFileImportSizeLimit } from "@/lib/config.ts";
import { formatBytes } from "@/lib";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { getFileTaskById } from "@/features/file-task/services/file-task-service.ts";
import { queryClient } from "@/main.tsx";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { getApiErrorMessage } from "@/lib/api-error";
import bytes from "bytes";
import TableImportSheetModal from "@/features/page/components/table-import-sheet-modal.tsx";

interface PageImportModalProps {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}

export default function PageImportModal({
  spaceId,
  open,
  onClose,
}: PageImportModalProps) {
  return (
    <ImportFormatSelection spaceId={spaceId} open={open} onClose={onClose} />
  );
}

interface ImportFormatSelection {
  spaceId: string;
  open: boolean;
  onClose: () => void;
}
function ImportFormatSelection({
  spaceId,
  open,
  onClose,
}: ImportFormatSelection) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const [fileTaskId, setFileTaskId] = useState<string | null>(null);
  const emit = useQueryEmit();

  const markdownFileRef = useRef<() => void>(null);
  const htmlFileRef = useRef<() => void>(null);
  const docxFileRef = useRef<() => void>(null);
  const pdfFileRef = useRef<() => void>(null);
  const notionFileRef = useRef<() => void>(null);
  const confluenceFileRef = useRef<() => void>(null);
  const zipFileRef = useRef<() => void>(null);
  const tableFileRef = useRef<() => void>(null);

  const canUseBases = useHasFeature(Feature.BASES);
  const upgradeLabel = useUpgradeLabel();

  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [pendingTableFile, setPendingTableFile] = useState<File | null>(null);
  const [tableSheets, setTableSheets] = useState<string[]>([]);
  const [tableImporting, setTableImporting] = useState(false);

  const handleZipUpload = async (selectedFile: File, source: string) => {
    if (!selectedFile) {
      return;
    }

    const maxSize = getFileImportSizeLimit();
    if (selectedFile.size > maxSize) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSize),
        }),
      });
      return;
    }

    try {
      onClose();

      notifications.show({
        id: "import",
        title: t("Uploading import file"),
        message: t("Please don't close this tab."),
        loading: true,
        withCloseButton: false,
        autoClose: false,
      });

      const importTask = await importZip(selectedFile, spaceId, source);
      notifications.update({
        id: "import",
        title: t("Importing pages"),
        message: t(
          "Page import is in progress. You can check back later if this takes longer.",
        ),
        loading: true,
        withCloseButton: true,
        autoClose: false,
      });

      setFileTaskId(importTask.id);

      // Reset file input after successful upload
      if (source === "notion" && notionFileRef.current) {
        notionFileRef.current();
      } else if (source === "confluence" && confluenceFileRef.current) {
        confluenceFileRef.current();
      } else if (source === "generic" && zipFileRef.current) {
        zipFileRef.current();
      }
    } catch (err) {
      console.log("Failed to upload import file", err);
      notifications.update({
        id: "import",
        color: "red",
        title: t("Failed to upload import file"),
        message: err?.response.data.message,
        icon: <IconX size={18} />,
        loading: false,
        withCloseButton: true,
        autoClose: false,
      });
    }
  };

  useEffect(() => {
    if (!fileTaskId) return;

    const intervalId = setInterval(async () => {
      try {
        const fileTask = await getFileTaskById(fileTaskId);
        const status = fileTask.status;

        if (status === "success") {
          notifications.update({
            id: "import",
            color: "teal",
            title: t("Import complete"),
            message: t("Your pages were successfully imported."),
            icon: <IconCheck size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);

          await queryClient.refetchQueries({
            queryKey: ["root-sidebar-pages", fileTask.spaceId],
          });

          await queryClient.invalidateQueries({
            queryKey: ["recent-changes", fileTask.spaceId],
          });

          setTimeout(() => {
            emit({
              operation: "refetchRootTreeNodeEvent",
              spaceId: spaceId,
            });
          }, 50);
        }

        if (status === "failed") {
          notifications.update({
            id: "import",
            color: "red",
            title: t("Page import failed"),
            message: t(
              "Something went wrong while importing pages: {{reason}}.",
              {
                reason: fileTask.errorMessage,
              },
            ),
            icon: <IconX size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);
          console.error(fileTask.errorMessage);
        }
      } catch (err) {
        notifications.update({
          id: "import",
          color: "red",
          title: t("Import failed"),
          message: t(
            "Something went wrong while importing pages: {{reason}}.",
            {
              reason: err.response?.data.message,
            },
          ),
          icon: <IconX size={18} />,
          loading: false,
          withCloseButton: true,
          autoClose: false,
        });
        clearInterval(intervalId);
        setFileTaskId(null);
        console.error("Failed to fetch import status", err);
      }
    }, 3000);
  }, [fileTaskId]);

  const maxSingleFileSize = bytes("30mb");

  const applyImportedPages = (pages: IPage[]) => {
    if (!pages?.length) return;
    const newTreeNodes = buildTree(pages);
    if (newTreeNodes?.length) {
      setTreeData((prev) => prev.concat(newTreeNodes));
    }
    queryClient.invalidateQueries({
      queryKey: ["root-sidebar-pages", spaceId],
    });
    setTimeout(() => {
      emit({
        operation: "refetchRootTreeNodeEvent",
        spaceId: spaceId,
      });
    }, 50);
  };

  const importTableFile = async (file: File, sheetNames?: string[]) => {
    const alert = notifications.show({
      title: t("Importing pages"),
      message: t("Page import is in progress. Please do not close this tab."),
      loading: true,
      autoClose: false,
    });

    try {
      const pages = await importTable(file, spaceId, sheetNames);
      applyImportedPages(pages);
      if (tableFileRef.current) tableFileRef.current();

      const pageCount = pages.length;
      const pageCountText =
        pageCount === 1 ? `1 ${t("page")}` : `${pageCount} ${t("pages")}`;

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} ${pageCountText}`,
        message: t("Your import is complete."),
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } catch (err) {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import table"),
        message: getApiErrorMessage(
          err,
          t("Unable to import pages. Please try again."),
        ),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 5000,
      });
    }
  };

  const handleTableFile = async (selectedFile: File | null) => {
    if (!selectedFile) return;

    if (selectedFile.size > maxSingleFileSize) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSingleFileSize),
        }),
      });
      return;
    }

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      onClose();
      await importTableFile(selectedFile);
      return;
    }

    try {
      const sheets = await readSpreadsheetSheetNames(selectedFile);
      if (!sheets.length) {
        notifications.show({
          color: "red",
          title: t("Failed to import table"),
          message: t("No sheets found in this file."),
        });
        return;
      }
      if (sheets.length === 1) {
        onClose();
        await importTableFile(selectedFile);
        return;
      }
      setPendingTableFile(selectedFile);
      setTableSheets(sheets);
      setSheetModalOpen(true);
    } catch (err) {
      notifications.show({
        color: "red",
        title: t("Failed to read spreadsheet"),
        message: getApiErrorMessage(
          err,
          t("Unable to import pages. Please try again."),
        ),
        icon: <IconX size={18} />,
      });
    }
  };

  const handleSheetConfirm = async (sheetNames: string[]) => {
    if (!pendingTableFile || sheetNames.length === 0) return;
    setTableImporting(true);
    onClose();
    try {
      await importTableFile(pendingTableFile, sheetNames);
      setSheetModalOpen(false);
      setPendingTableFile(null);
    } finally {
      setTableImporting(false);
    }
  };

  const handleFileUpload = async (selectedFiles: File[]) => {
    if (!selectedFiles) {
      return;
    }

    const oversizedFiles = selectedFiles.filter(
      (f) => f.size > maxSingleFileSize,
    );
    if (oversizedFiles.length > 0) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSingleFileSize),
        }),
      });
      return;
    }

    onClose();

    const alert = notifications.show({
      title: t("Importing pages"),
      message: t("Page import is in progress. Please do not close this tab."),
      loading: true,
      autoClose: false,
    });

    const pages: IPage[] = [];
    let pageCount = 0;
    let lastError: unknown = null;

    for (const file of selectedFiles) {
      try {
        const page = await importPage(file, spaceId);
        pages.push(page);
        pageCount += 1;
      } catch (err) {
        lastError = err;
        console.log("Failed to import page", err);
      }
    }

    if (pages?.length > 0 && pageCount > 0) {
      const newTreeNodes = buildTree(pages);
      const fullTree = treeData.concat(newTreeNodes);

      if (newTreeNodes?.length && fullTree?.length > 0) {
        setTreeData(fullTree);
      }

      // Reset file inputs after successful upload
      if (markdownFileRef.current) markdownFileRef.current();
      if (htmlFileRef.current) htmlFileRef.current();
      if (docxFileRef.current) docxFileRef.current();
      if (pdfFileRef.current) pdfFileRef.current();

      const pageCountText =
        pageCount === 1 ? `1 ${t("page")}` : `${pageCount} ${t("pages")}`;

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} ${pageCountText}`,
        message: t("Your import is complete."),
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } else {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import pages"),
        message: getApiErrorMessage(
          lastError,
          t("Unable to import pages. Please try again."),
        ),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 5000,
      });
    }
  };

  // @ts-ignore
  return (
    <>
      <Modal.Root
        opened={open}
        onClose={onClose}
        size={600}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        mah={400}
        keepMounted={true}
      >
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Import pages")}</Modal.Title>
            <Modal.CloseButton aria-label={t("Close")} />
          </Modal.Header>
          <Modal.Body>
            <SimpleGrid cols={2}>
        <FileButton
          onChange={handleFileUpload}
          accept=".md"
          multiple
          resetRef={markdownFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Markdown" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconMarkdown size={18} />}
              {...props}
            >
              Markdown
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept="text/html"
          multiple
          resetRef={htmlFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "HTML" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileCode size={18} />}
              {...props}
            >
              HTML
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".docx"
          multiple
          resetRef={docxFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Word (DOCX)" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileTypeDocx size={18} />}
              {...props}
            >
              Word (DOCX)
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".pdf"
          multiple
          resetRef={pdfFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "PDF" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileTypePdf size={18} />}
              {...props}
            >
              PDF
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleTableFile}
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          resetRef={tableFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Table" }),
          }}
        >
          {(props) => (
            <Tooltip label={upgradeLabel} disabled={canUseBases}>
              <Button
                disabled={!canUseBases}
                justify="start"
                variant="default"
                leftSection={<IconTable size={18} />}
                {...props}
              >
                {t("Table")}
              </Button>
            </Tooltip>
          )}
        </FileButton>

        <FileButton
          onChange={(file) => handleZipUpload(file, "notion")}
          accept="application/zip"
          resetRef={notionFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Notion" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconBrandNotion size={18} />}
              {...props}
            >
              Notion
            </Button>
          )}
        </FileButton>
        <FileButton
          onChange={(file) => handleZipUpload(file, "confluence")}
          accept="application/zip"
          resetRef={confluenceFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Confluence" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<ConfluenceIcon size={18} />}
              {...props}
            >
              Confluence
            </Button>
          )}
        </FileButton>
      </SimpleGrid>

      <Group justify="center" gap="xl" mih={150}>
        <div>
          <Text ta="center" size="lg" inline>
            Import zip file
          </Text>
          <Text ta="center" size="sm" c="dimmed" inline py="sm">
            {t(
              `Upload zip file containing Markdown and HTML files. Max: {{sizeLimit}}`,
              {
                sizeLimit: formatBytes(getFileImportSizeLimit()),
              },
            )}
          </Text>
          <FileButton
            onChange={(file) => handleZipUpload(file, "generic")}
            accept="application/zip"
            resetRef={zipFileRef}
            inputProps={{
              "aria-label": t("Choose {{format}} file", { format: "ZIP" }),
            }}
          >
            {(props) => (
              <Group justify="center">
                <Button
                  justify="center"
                  leftSection={<IconFileTypeZip size={18} />}
                  {...props}
                >
                  {t("Upload file")}
                </Button>
              </Group>
            )}
          </FileButton>
        </div>
      </Group>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      <TableImportSheetModal
        open={sheetModalOpen}
        sheets={tableSheets}
        fileName={pendingTableFile?.name}
        loading={tableImporting}
        onClose={() => {
          if (tableImporting) return;
          setSheetModalOpen(false);
          setPendingTableFile(null);
        }}
        onConfirm={handleSheetConfirm}
      />
    </>
  );
}
