import { Modal, Text, ScrollArea } from "@mantine/core";
import { IconTable } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor.tsx";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { PdfPage } from "@/features/page/components/pdf-page";
import { WordPage } from "@/features/page/components/word-page";
import { SpreadsheetPage } from "@/features/page/components/spreadsheet-page";
import { SlidePage } from "@/features/page/components/slide-page";

interface Props {
  opened: boolean;
  onClose: () => void;
  pageTitle: string;
  pageContent: any;
  isBase?: boolean;
  fileType?: string | null;
}

export default function TrashPageContentModal({
  opened,
  onClose,
  pageTitle,
  pageContent,
  isBase,
  fileType,
}: Props) {
  const { t } = useTranslation();
  const title = pageTitle || t("Untitled");

  return (
    <Modal.Root size={1200} opened={opened} onClose={onClose} aria-label={t("Preview")}>
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header>
          <Modal.Title>
            <Text size="md" fw={500}>
              {t("Preview")}
            </Text>
          </Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body p={0}>
          <ScrollArea h="650" w="100%" scrollbarSize={5}>
            {isBase ? (
              <EmptyState
                icon={IconTable}
                title={t("Base preview unavailable")}
                description={t("Restore this base to view its contents.")}
              />
            ) : fileType === "pdf" ? (
              <div style={{ height: 650 }}>
                <PdfPage title={title} content={pageContent} />
              </div>
            ) : fileType === "word" ? (
              <div style={{ height: 650 }}>
                <WordPage title={title} content={pageContent} />
              </div>
            ) : fileType === "spreadsheet" ? (
              <div style={{ height: 650 }}>
                <SpreadsheetPage title={title} content={pageContent} />
              </div>
            ) : fileType === "slide" ? (
              <div style={{ height: 650 }}>
                <SlidePage title={title} content={pageContent} />
              </div>
            ) : (
              <ReadonlyPageEditor title={title} content={pageContent} />
            )}
          </ScrollArea>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
