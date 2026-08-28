import { Button, Checkbox, Group, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface TableImportSheetModalProps {
  open: boolean;
  sheets: string[];
  fileName?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (sheetNames: string[]) => void;
}

export default function TableImportSheetModal({
  open,
  sheets,
  fileName,
  loading,
  onClose,
  onConfirm,
}: TableImportSheetModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(sheets);

  useEffect(() => {
    if (open) {
      setSelected(sheets);
    }
  }, [open, sheets]);

  const allSelected = sheets.length > 0 && selected.length === sheets.length;

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={t("Select sheets to import")}
      size="md"
      zIndex={400}
      withinPortal
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "This spreadsheet has multiple sheets. Select which sheets to import as base pages.",
          )}
        </Text>
        {fileName && (
          <Text size="sm" fw={500}>
            {fileName}
          </Text>
        )}
        <Checkbox
          label={t("Select all")}
          checked={allSelected}
          indeterminate={selected.length > 0 && !allSelected}
          onChange={() =>
            setSelected(allSelected ? [] : [...sheets])
          }
        />
        <ScrollArea.Autosize mah={280} type="auto">
          <Checkbox.Group value={selected} onChange={setSelected}>
            <Stack gap="xs">
              {sheets.map((name) => (
                <Checkbox key={name} value={name} label={name} />
              ))}
            </Stack>
          </Checkbox.Group>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() => onConfirm(selected)}
            disabled={selected.length === 0}
            loading={loading}
          >
            {t("Import selected")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
