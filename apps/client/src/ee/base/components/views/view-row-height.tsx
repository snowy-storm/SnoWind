import { Menu, ActionIcon, Tooltip } from "@mantine/core";
import { IconCheck, IconLineHeight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IBaseView } from "@/ee/base/types/base.types";
import { useUpdateViewMutation } from "@/ee/base/queries/base-view-query";
import { useBaseEditable } from "@/ee/base/context/base-editable";
import {
  parseTableRowHeight,
  TABLE_ROW_HEIGHT_OPTIONS,
  type TableRowHeight,
} from "@/ee/base/utils/row-height";

type ViewRowHeightPickerProps = {
  view: IBaseView;
  pageId: string;
};

export function ViewRowHeightPicker({
  view,
  pageId,
}: ViewRowHeightPickerProps) {
  const { t } = useTranslation();
  const editable = useBaseEditable();
  const updateView = useUpdateViewMutation();
  const current = parseTableRowHeight(view.config?.rowHeight);

  const handleChange = (value: TableRowHeight) => {
    if (!editable || value === current) return;
    updateView.mutate({
      viewId: view.id,
      pageId,
      config: { rowHeight: value },
    });
  };

  return (
    <Menu position="bottom-end" shadow="md" width={160} withinPortal>
      <Menu.Target>
        <Tooltip label={t("Row height")}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color={current !== "normal" ? "blue" : "gray"}
            aria-label={t("Row height")}
          >
            <IconLineHeight size={16} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t("Row height")}</Menu.Label>
        {TABLE_ROW_HEIGHT_OPTIONS.map((option) => (
          <Menu.Item
            key={option.value}
            leftSection={
              current === option.value ? (
                <IconCheck size={14} />
              ) : (
                <span style={{ width: 14 }} />
              )
            }
            disabled={!editable}
            onClick={() => handleChange(option.value)}
          >
            {t(option.label)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
