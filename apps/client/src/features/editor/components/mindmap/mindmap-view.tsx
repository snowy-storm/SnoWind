import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Card, Text } from "@mantine/core";
import { useCallback, useEffect, useRef } from "react";
import { useDisclosure } from "@mantine/hooks";
import { IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { MindmapEditorModal } from "@/features/mindmap/mindmap-editor-modal";
import { getFileUrl } from "@/lib/config.ts";
import type { MindmapSavePayload } from "@/features/mindmap/mindmap-save";

export default function MindmapView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, editor, selected } = props;
  const { src, data, attachmentId, align, width, height } = node.attrs;
  const [opened, { open, close }] = useDisclosure(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const handleOpen = useCallback(() => {
    if (!editor.isEditable) return;
    open();
  }, [editor.isEditable, open]);

  useEffect(() => {
    const storage = editor.storage?.mindmap;
    if (storage?.autoOpen && editor.isEditable) {
      storage.autoOpen = false;
      handleOpen();
    }
  }, [editor, handleOpen]);

  useEffect(() => {
    const onEdit = () => {
      if (selectedRef.current) handleOpen();
    };
    document.addEventListener("snowind:edit-mindmap", onEdit);
    return () => document.removeEventListener("snowind:edit-mindmap", onEdit);
  }, [handleOpen]);

  const handleSave = async (payload: MindmapSavePayload) => {
    updateAttributes(payload);
  };

  const justify =
    align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  return (
    <NodeViewWrapper data-drag-handle>
      <MindmapEditorModal
        opened={opened}
        onClose={close}
        initialData={data}
        pageId={(editor.storage as { pageId?: string })?.pageId}
        attachmentId={attachmentId}
        onSave={handleSave}
      />

      <div
        style={{
          display: "flex",
          justifyContent: justify,
        }}
      >
        {src ? (
          <img
            src={getFileUrl(src)}
            alt={node.attrs.alt || node.attrs.title || t("Mind map")}
            onClick={(event) => {
              if (event.detail === 2) handleOpen();
            }}
            className={clsx(selected ? "ProseMirror-selectednode" : "")}
            style={{
              display: "block",
              maxWidth: "100%",
              width: width ? (typeof width === "number" ? `${width}px` : width) : undefined,
              height: height ? `${height}px` : "auto",
              borderRadius: 8,
              cursor: editor.isEditable ? "pointer" : "default",
            }}
          />
        ) : (
          <Card
            radius="md"
            onClick={(event) => event.detail === 2 && handleOpen()}
            p="xs"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: editor.isEditable ? "pointer" : "default",
            }}
            withBorder
            className={clsx(selected ? "ProseMirror-selectednode" : "")}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {editor.isEditable && (
                <ActionIcon
                  variant="transparent"
                  color="gray"
                  aria-label={t("Edit mind map")}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpen();
                  }}
                >
                  <IconEdit size={18} />
                </ActionIcon>
              )}
              <Text component="span" size="lg" c="dimmed">
                {t("Double-click to edit mind map")}
              </Text>
            </div>
          </Card>
        )}
      </div>
    </NodeViewWrapper>
  );
}
