import { ActionIcon, Button, Card, Group, Text } from "@mantine/core";
import { IconDownload, IconEdit } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { getFileUrl } from "@/lib/config.ts";

type DrawingPreviewProps = {
  src?: string;
  emptyLabel: string;
  editable: boolean;
  onEdit: () => void;
  onDownload: () => void;
  isOpening?: boolean;
};

export function DrawingPreview({
  src,
  emptyLabel,
  editable,
  onEdit,
  onDownload,
  isOpening,
}: DrawingPreviewProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Group justify="flex-end" wrap="nowrap" px="xs" py={6} gap="xs">
        {editable && (
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconEdit size={16} />}
            onClick={onEdit}
            loading={isOpening}
          >
            {t("Edit")}
          </Button>
        )}
        <Button
          size="compact-sm"
          variant="default"
          leftSection={<IconDownload size={16} />}
          onClick={onDownload}
          disabled={!src}
        >
          {t("Download")}
        </Button>
      </Group>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: src ? "flex-start" : "center",
          padding: 24,
        }}
      >
        {src ? (
          <img
            src={getFileUrl(src)}
            alt=""
            onClick={(event) => {
              if (editable && event.detail === 2) onEdit();
            }}
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              borderRadius: 8,
              cursor: editable ? "pointer" : "default",
            }}
          />
        ) : (
          <Card
            radius="md"
            onClick={(event) => {
              if (editable && event.detail === 2) onEdit();
            }}
            p="xs"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: editable ? "pointer" : "default",
            }}
            withBorder
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {editable && (
                <ActionIcon
                  variant="transparent"
                  color="gray"
                  aria-label={t("Edit")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                  }}
                >
                  <IconEdit size={18} />
                </ActionIcon>
              )}
              <Text component="span" size="lg" c="dimmed">
                {emptyLabel}
              </Text>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
