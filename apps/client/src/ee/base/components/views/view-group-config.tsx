import { useCallback, useEffect, useState } from "react";
import {
  Popover,
  Stack,
  Group,
  Select,
  ActionIcon,
  Text,
  UnstyledButton,
  Button,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  IBaseProperty,
  MAX_TABLE_GROUP_LEVELS,
  ViewGroupConfig,
} from "@/ee/base/types/base.types";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "@/ee/base/hooks/use-escape-close";
import viewClasses from "@/ee/base/styles/views.module.css";

type ViewGroupConfigProps = {
  opened: boolean;
  onClose: () => void;
  groups: ViewGroupConfig[];
  properties: IBaseProperty[];
  onChange: (groups: ViewGroupConfig[]) => void;
  children: React.ReactNode;
};

export function ViewGroupConfigPopover({
  opened,
  onClose,
  groups,
  properties,
  onChange,
  children,
}: ViewGroupConfigProps) {
  const { t } = useTranslation();
  useEscapeClose(opened, onClose);
  const [draft, setDraft] = useState<ViewGroupConfig | null>(null);

  useEffect(() => {
    if (!opened) setDraft(null);
  }, [opened]);

  const groupableProperties = properties;

  const usedIds = new Set(groups.map((g) => g.propertyId));
  if (draft) usedIds.add(draft.propertyId);

  const propertyOptionsFor = (currentId?: string) => {
    const taken = new Set(usedIds);
    if (currentId) taken.delete(currentId);
    return groupableProperties
      .filter((p) => p.id === currentId || !taken.has(p.id))
      .map((p) => ({
        value: p.id,
        label: p.name,
      }));
  };

  const directionOptions = [
    { value: "asc", label: t("Ascending") },
    { value: "desc", label: t("Descending") },
  ];

  const handleStartDraft = useCallback(() => {
    const taken = new Set(groups.map((g) => g.propertyId));
    const available = groupableProperties.find((p) => !taken.has(p.id));
    if (!available) return;
    setDraft({ propertyId: available.id, direction: "asc" });
  }, [groups, groupableProperties]);

  const handleSaveDraft = useCallback(() => {
    if (!draft) return;
    onChange([...groups, draft]);
    setDraft(null);
  }, [draft, groups, onChange]);

  const handleCancelDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(groups.filter((_, i) => i !== index));
    },
    [groups, onChange],
  );

  const handlePropertyChange = useCallback(
    (index: number, propertyId: string | null) => {
      if (!propertyId) return;
      onChange(
        groups.map((g, i) => (i === index ? { ...g, propertyId } : g)),
      );
    },
    [groups, onChange],
  );

  const handleDirectionChange = useCallback(
    (index: number, direction: string | null) => {
      if (!direction) return;
      onChange(
        groups.map((g, i) =>
          i === index
            ? { ...g, direction: direction as "asc" | "desc" }
            : g,
        ),
      );
    },
    [groups, onChange],
  );

  const canAddMore =
    groups.length + (draft ? 1 : 0) < MAX_TABLE_GROUP_LEVELS &&
    groupableProperties.length > groups.length + (draft ? 1 : 0);

  return (
    <Popover
      opened={opened}
      onChange={(o) => {
        if (!o) onClose();
      }}
      onClose={onClose}
      position="bottom-end"
      shadow="md"
      width={340}
      trapFocus
      closeOnEscape
      closeOnClickOutside
      withinPortal
    >
      <Popover.Target>{children}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed">
            {t("Group by")}
          </Text>

          {groups.length === 0 && !draft && (
            <Text size="xs" c="dimmed">
              {t("No grouping applied")}
            </Text>
          )}

          {groups.map((group, index) => (
            <Group key={index} gap="xs" wrap="nowrap">
              <Select
                size="xs"
                comboboxProps={{ withinPortal: false }}
                data={propertyOptionsFor(group.propertyId)}
                value={group.propertyId}
                onChange={(val) => handlePropertyChange(index, val)}
                style={{ flex: 1 }}
              />
              <Select
                size="xs"
                comboboxProps={{ withinPortal: false }}
                data={directionOptions}
                value={group.direction}
                onChange={(val) => handleDirectionChange(index, val)}
                w={110}
              />
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => handleRemove(index)}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}

          {draft && (
            <Stack gap={6}>
              <Group gap="xs" wrap="nowrap">
                <Select
                  size="xs"
                  comboboxProps={{ withinPortal: false }}
                  data={propertyOptionsFor(draft.propertyId)}
                  value={draft.propertyId}
                  onChange={(val) =>
                    val && setDraft({ ...draft, propertyId: val })
                  }
                  style={{ flex: 1 }}
                />
                <Select
                  size="xs"
                  comboboxProps={{ withinPortal: false }}
                  data={directionOptions}
                  value={draft.direction}
                  onChange={(val) =>
                    val &&
                    setDraft({
                      ...draft,
                      direction: val as "asc" | "desc",
                    })
                  }
                  w={110}
                />
              </Group>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  onClick={handleCancelDraft}
                >
                  {t("Cancel")}
                </Button>
                <Button size="xs" onClick={handleSaveDraft}>
                  {t("Save")}
                </Button>
              </Group>
            </Stack>
          )}

          {!draft && canAddMore && (
            <UnstyledButton
              onClick={handleStartDraft}
              className={viewClasses.addActionButton}
            >
              <IconPlus size={14} />
              {groups.length === 0
                ? t("Add group")
                : t("Add subgroup")}
            </UnstyledButton>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
