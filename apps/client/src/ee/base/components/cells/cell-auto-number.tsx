import { Text } from "@mantine/core";
import { IBaseProperty, AutoNumberTypeOptions } from "@/ee/base/types/base.types";
import { formatAutoNumberDisplay } from "@/ee/base/formatters/cell-formatters";
import cellClasses from "@/ee/base/styles/cells.module.css";
import { useBaseSearchHighlight } from "@/features/page-find/utils/highlight-text-matches";

type CellAutoNumberProps = {
  value: unknown;
  property: IBaseProperty;
  rowId: string;
  isEditing: boolean;
  readOnly?: boolean;
  onCommit: (value: unknown) => void;
  onValueChange: (value: unknown) => void;
  onCancel: () => void;
};

export function CellAutoNumber({ value, property }: CellAutoNumberProps) {
  const display = formatAutoNumberDisplay(
    value,
    property.typeOptions as AutoNumberTypeOptions | undefined,
  );
  const highlighted = useBaseSearchHighlight(display);

  if (!display) {
    return <span className={cellClasses.emptyValue} />;
  }

  return (
    <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }} truncate>
      {highlighted}
    </Text>
  );
}
