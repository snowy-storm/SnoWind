import { IBaseProperty } from "@/ee/base/types/base.types";
import { Tooltip } from "@mantine/core";
import { useEditableTextCell } from "@/ee/base/hooks/use-editable-text-cell";
import cellClasses from "@/ee/base/styles/cells.module.css";
import gridClasses from "@/ee/base/styles/grid.module.css";
import { useBaseSearchHighlight } from "@/features/page-find/utils/highlight-text-matches";

type CellEmailProps = {
  value: unknown;
  property: IBaseProperty;
  rowId: string;
  isEditing: boolean;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
};

const toDraft = (value: unknown) => (typeof value === "string" ? value : "");
const parse = (draft: string) => draft || null;

export function CellEmail({ value, property, rowId, isEditing, onCommit, onCancel }: CellEmailProps) {
  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } =
    useEditableTextCell({
      value,
      isEditing,
      onCommit,
      onCancel,
      toDraft,
      parse,
      rowId,
      propertyId: property.id,
    });
  const displayValue = toDraft(value);
  const highlighted = useBaseSearchHighlight(displayValue);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="email"
        className={cellClasses.cellInput}
        value={draft}
        placeholder="email@example.com"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    );
  }

  if (!displayValue) {
    return <span className={cellClasses.emptyValue} />;
  }
  return (
    <Tooltip label={displayValue} multiline withinPortal openDelay={400} maw={420}>
      <a
        className={`${cellClasses.emailLink} ${gridClasses.cellContent}`}
        href={`mailto:${displayValue}`}
        onClick={(e) => e.stopPropagation()}
      >
        {highlighted}
      </a>
    </Tooltip>
  );
}
