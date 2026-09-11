import { useCallback, useEffect, useMemo } from "react";
import { Table } from "@tanstack/react-table";
import {
  IBaseRow,
  IBaseProperty,
  EditingCell,
  FocusedCell,
  CellCoord,
} from "@/ee/base/types/base.types";
import { computeNextCell } from "@/ee/base/utils/grid-cell-nav";
import {
  buildCellSelection,
  singleCellSelection,
  type CellSelection,
} from "@/ee/base/utils/cell-selection";

type UseGridKeyboardNavOptions = {
  table: Table<IBaseRow>;
  properties: IBaseProperty[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  focusedCell: FocusedCell;
  setFocusedCell: (cell: FocusedCell) => void;
  editingCell: EditingCell;
  setEditingCell: (cell: EditingCell) => void;
  openEditor: (coord: CellCoord) => void;
  clearSelectionCells: () => void;
  copyCell: (coord: CellCoord) => void;
  pasteCell: (coord: CellCoord) => void | Promise<void>;
  beginTypeToEdit: (coord: CellCoord, char: string) => void;
  scrollCellIntoView: (coord: CellCoord, rowIndex: number) => void;
  selectionCount: number;
  clearSelection: () => void;
  deleteSelected: () => void | Promise<void>;
  toggleRowSelection: (rowId: string) => void;
  expandRow: (rowId: string) => void;
  addRow: (afterRowId: string, focusPropertyId: string) => void;
  getOrderedRowIds?: () => string[];
  cellSelection: CellSelection | null;
  setCellSelection: (sel: CellSelection | null) => void;
};

const isPrintableKey = (e: KeyboardEvent) =>
  e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

const isTextEntry = (el: Element | null) =>
  !!el &&
  (el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    (el as HTMLElement).isContentEditable);

export function useGridKeyboardNav({
  table,
  properties,
  containerRef,
  focusedCell,
  setFocusedCell,
  editingCell,
  setEditingCell,
  openEditor,
  clearSelectionCells,
  copyCell,
  pasteCell,
  beginTypeToEdit,
  scrollCellIntoView,
  selectionCount,
  clearSelection,
  deleteSelected,
  toggleRowSelection,
  expandRow,
  addRow,
  getOrderedRowIds,
  cellSelection,
  setCellSelection,
}: UseGridKeyboardNavOptions) {
  const getColIds = useCallback(
    () =>
      table
        .getVisibleLeafColumns()
        .filter((col) => col.id !== "__row_number")
        .map((col) => col.id),
    [table],
  );

  const getNavColIds = useCallback(
    () => table.getVisibleLeafColumns().map((col) => col.id),
    [table],
  );

  const getRowIds = useCallback(
    () =>
      getOrderedRowIds
        ? getOrderedRowIds()
        : table.getRowModel().rows.map((row) => row.id),
    [getOrderedRowIds, table],
  );

  const propertyType = useCallback(
    (propertyId: string) => properties.find((p) => p.id === propertyId)?.type,
    [properties],
  );

  const primaryPropertyId = useMemo(
    () => properties.find((p) => p.isPrimary)?.id,
    [properties],
  );

  const goEditing = useCallback(
    (next: CellCoord) => {
      (document.activeElement as HTMLElement | null)?.blur();
      setEditingCell(next);
      setFocusedCell(next);
      setCellSelection(singleCellSelection(next, getRowIds()));
      scrollCellIntoView(next, getRowIds().indexOf(next.rowId));
    },
    [
      setEditingCell,
      setFocusedCell,
      setCellSelection,
      scrollCellIntoView,
      getRowIds,
    ],
  );

  const goFocused = useCallback(
    (next: CellCoord, opts?: { extend?: boolean }) => {
      const ordered = getRowIds();
      if (opts?.extend && focusedCell) {
        // Column-scoped: only extend vertically within the same property.
        if (next.propertyId === focusedCell.propertyId) {
          const anchor =
            cellSelection && cellSelection.propertyId === focusedCell.propertyId
              ? cellSelection.anchorRowId
              : focusedCell.rowId;
          const nextSel = buildCellSelection(
            focusedCell.propertyId,
            anchor,
            next.rowId,
            ordered,
          );
          if (nextSel) setCellSelection(nextSel);
          setFocusedCell(next);
          scrollCellIntoView(next, ordered.indexOf(next.rowId));
          return;
        }
      }
      setFocusedCell(next);
      setCellSelection(singleCellSelection(next, ordered));
      scrollCellIntoView(next, ordered.indexOf(next.rowId));
    },
    [
      getRowIds,
      focusedCell,
      cellSelection,
      setCellSelection,
      setFocusedCell,
      scrollCellIntoView,
    ],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingCell) {
        const inInput = isTextEntry(e.target as Element);
        switch (e.key) {
          case "ArrowUp":
          case "ArrowDown":
          case "ArrowLeft":
          case "ArrowRight": {
            if (inInput) return;
            e.preventDefault();
            const d =
              e.key === "ArrowUp"
                ? [-1, 0]
                : e.key === "ArrowDown"
                  ? [1, 0]
                  : e.key === "ArrowLeft"
                    ? [0, -1]
                    : [0, 1];
            const next = computeNextCell(
              getRowIds(),
              getColIds(),
              editingCell,
              d[0],
              d[1],
              false,
            );
            if (next) goEditing(next);
            break;
          }
          case "Tab": {
            e.preventDefault();
            const next = computeNextCell(
              getRowIds(),
              getColIds(),
              editingCell,
              0,
              e.shiftKey ? -1 : 1,
              true,
            );
            if (next) goEditing(next);
            break;
          }
          case "Enter": {
            e.preventDefault();
            if (e.shiftKey && editingCell.propertyId === primaryPropertyId) {
              (document.activeElement as HTMLElement | null)?.blur();
              setEditingCell(null);
              addRow(editingCell.rowId, editingCell.propertyId);
              break;
            }
            const next = computeNextCell(
              getRowIds(),
              getColIds(),
              editingCell,
              1,
              0,
              false,
            );
            (document.activeElement as HTMLElement | null)?.blur();
            setEditingCell(null);
            if (next) goFocused(next);
            else {
              setFocusedCell(editingCell);
              setCellSelection(singleCellSelection(editingCell, getRowIds()));
            }
            break;
          }
          case "Escape": {
            e.preventDefault();
            setEditingCell(null);
            setFocusedCell(editingCell);
            setCellSelection(singleCellSelection(editingCell, getRowIds()));
            break;
          }
        }
        return;
      }

      if (e.target !== containerRef.current) return;

      if (isTextEntry(document.activeElement)) return;

      if (e.key === "Escape") {
        if (selectionCount > 0) {
          e.preventDefault();
          clearSelection();
        } else if (cellSelection && cellSelection.rowIds.length > 1) {
          e.preventDefault();
          if (focusedCell) {
            setCellSelection(singleCellSelection(focusedCell, getRowIds()));
          } else {
            setCellSelection(null);
          }
        } else if (focusedCell) {
          e.preventDefault();
          setFocusedCell(null);
          setCellSelection(null);
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionCount > 0) {
          e.preventDefault();
          void deleteSelected();
        } else if (focusedCell || (cellSelection && cellSelection.rowIds.length > 0)) {
          e.preventDefault();
          clearSelectionCells();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "c" || key === "insert") {
          if (focusedCell && focusedCell.propertyId !== "__row_number") {
            e.preventDefault();
            copyCell(focusedCell);
          }
          return;
        }
        if (key === "v") {
          if (focusedCell && focusedCell.propertyId !== "__row_number") {
            e.preventDefault();
            void pasteCell(focusedCell);
          }
          return;
        }
      }

      if (!focusedCell) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          {
            const next = computeNextCell(
              getRowIds(),
              getNavColIds(),
              focusedCell,
              -1,
              0,
              false,
            );
            if (next) goFocused(next, { extend: e.shiftKey });
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          {
            const next = computeNextCell(
              getRowIds(),
              getNavColIds(),
              focusedCell,
              1,
              0,
              false,
            );
            if (next) goFocused(next, { extend: e.shiftKey });
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          {
            const next = computeNextCell(
              getRowIds(),
              getNavColIds(),
              focusedCell,
              0,
              -1,
              false,
            );
            if (next) goFocused(next);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          {
            const next = computeNextCell(
              getRowIds(),
              getNavColIds(),
              focusedCell,
              0,
              1,
              false,
            );
            if (next) goFocused(next);
          }
          break;
        case "Tab": {
          const next = computeNextCell(
            getRowIds(),
            getNavColIds(),
            focusedCell,
            0,
            e.shiftKey ? -1 : 1,
            true,
          );
          if (next) {
            e.preventDefault();
            goFocused(next);
          }
          break;
        }
        case "Enter":
        case "F2":
          e.preventDefault();
          if (
            e.key === "Enter" &&
            e.shiftKey &&
            focusedCell.propertyId === primaryPropertyId
          ) {
            addRow(focusedCell.rowId, focusedCell.propertyId);
          } else if (focusedCell.propertyId === "__row_number") {
            toggleRowSelection(focusedCell.rowId);
          } else {
            openEditor(focusedCell);
          }
          break;
        default: {
          if (e.key === " ") {
            e.preventDefault();
            if (focusedCell.propertyId === "__row_number") {
              toggleRowSelection(focusedCell.rowId);
            } else if (propertyType(focusedCell.propertyId) === "checkbox") {
              openEditor(focusedCell);
            } else {
              expandRow(focusedCell.rowId);
            }
          } else if (isPrintableKey(e)) {
            e.preventDefault();
            beginTypeToEdit(focusedCell, e.key);
          }
        }
      }
    },
    [
      containerRef,
      editingCell,
      focusedCell,
      cellSelection,
      getRowIds,
      getColIds,
      getNavColIds,
      goEditing,
      goFocused,
      setEditingCell,
      setFocusedCell,
      setCellSelection,
      openEditor,
      clearSelectionCells,
      copyCell,
      pasteCell,
      beginTypeToEdit,
      propertyType,
      selectionCount,
      clearSelection,
      deleteSelected,
      toggleRowSelection,
      expandRow,
      primaryPropertyId,
      addRow,
    ],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, handleKeyDown]);
}
