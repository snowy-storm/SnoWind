import { memo, useCallback, useMemo } from "react";
import { Checkbox, Tooltip } from "@mantine/core";
import { IconGripVertical, IconArrowsDiagonal } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useRowSelection } from "@/ee/base/hooks/use-row-selection";
import { focusedCellAtomFamily } from "@/ee/base/atoms/base-atoms";
import { FocusedCell } from "@/ee/base/types/base.types";
import { useBaseEditable } from "@/ee/base/context/base-editable";
import { useGridRowOrder } from "@/ee/base/context/grid-row-order";
import { useRowExpand } from "@/ee/base/context/row-expand";
import classes from "@/ee/base/styles/grid.module.css";

type RowNumberCellProps = {
  rowId: string;
  rowIndex: number;
  isPinned: boolean;
  pinOffset?: number;
  pageId: string;
  showExpand?: boolean;
};

export const RowNumberCell = memo(function RowNumberCell({
  rowId,
  rowIndex,
  isPinned,
  pinOffset,
  pageId,
  showExpand,
}: RowNumberCellProps) {
  const { t } = useTranslation();
  const { isSelected, toggle } = useRowSelection(pageId);
  const selected = isSelected(rowId);
  const editable = useBaseEditable();
  const getOrderedRowIds = useGridRowOrder();
  const onExpandRow = useRowExpand();

  const setFocusedCell = useSetAtom(
    focusedCellAtomFamily(pageId) as PrimitiveAtom<FocusedCell>,
  );
  const isFocused = useAtomValue(
    useMemo(
      () =>
        selectAtom(
          focusedCellAtomFamily(pageId),
          (fc) => fc?.rowId === rowId && fc?.propertyId === "__row_number",
        ),
      [pageId, rowId],
    ),
  );

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      setFocusedCell({ rowId, propertyId: "__row_number" });
    },
    [rowId, setFocusedCell],
  );

  const handleCellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setFocusedCell({ rowId, propertyId: "__row_number" });
      (e.currentTarget.closest('[role="grid"]') as HTMLElement | null)?.focus({
        preventScroll: true,
      });
    },
    [rowId, setFocusedCell],
  );

  const handleCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nativeEvent = e.nativeEvent as MouseEvent;
      toggle(rowId, {
        shiftKey: nativeEvent.shiftKey === true,
        rowIndex,
        orderedRowIds: getOrderedRowIds(),
      });
    },
    [rowId, rowIndex, getOrderedRowIds, toggle],
  );

  return (
    <div
      id={`base-cell-${rowId}-__row_number`}
      role="gridcell"
      className={`${classes.cell} ${classes.rowNumberCell} ${isPinned ? classes.cellPinned : ""} ${isFocused ? classes.cellFocused : ""}`}
      style={
        isPinned
          ? ({ "--pin-offset": `${pinOffset ?? 0}px` } as React.CSSProperties)
          : undefined
      }
      onClick={handleCellClick}
      onMouseDown={handleCellMouseDown}
    >
      <div className={classes.rowNumberCellInner}>
        {editable && (
          <span className={classes.rowNumberDragHandle} aria-label="Drag row">
            <IconGripVertical size={12} />
          </span>
        )}
        {editable && (
          <span className={classes.rowNumberCheckbox}>
            <Checkbox
              size="xs"
              checked={selected}
              onChange={handleCheckboxChange}
              aria-label="Select row"
              tabIndex={-1}
            />
          </span>
        )}
        <span className={classes.rowNumberIndex}>{rowIndex + 1}</span>
        {showExpand && onExpandRow && (
          <span className={classes.rowExpandAnchor}>
            <Tooltip label={t("Expand")} position="bottom" openDelay={400}>
              <button
                type="button"
                tabIndex={-1}
                data-base-row-expand=""
                className={classes.rowExpandButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandRow(rowId);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                aria-label={t("Expand row {{number}}", {
                  number: rowIndex + 1,
                })}
              >
                <IconArrowsDiagonal size={13} />
              </button>
            </Tooltip>
          </span>
        )}
      </div>
    </div>
  );
});
