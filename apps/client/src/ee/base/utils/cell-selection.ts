import type { CellCoord } from "@/ee/base/types/base.types";
import { fillCellKey } from "@/ee/base/utils/cell-fill";

/** Column-scoped contiguous selection (Excel-like, same property only). */
export type CellSelection = {
  propertyId: string;
  anchorRowId: string;
  focusRowId: string;
  /** Ordered row ids in the selection (cached for highlight / copy). */
  rowIds: string[];
};

export function buildCellSelection(
  propertyId: string,
  anchorRowId: string,
  focusRowId: string,
  orderedRowIds: string[],
): CellSelection | null {
  const a = orderedRowIds.indexOf(anchorRowId);
  const b = orderedRowIds.indexOf(focusRowId);
  if (a < 0 || b < 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return {
    propertyId,
    anchorRowId,
    focusRowId,
    rowIds: orderedRowIds.slice(lo, hi + 1),
  };
}

export function selectionCellKeySet(selection: CellSelection): Set<string> {
  return new Set(
    selection.rowIds.map((rowId) => fillCellKey(rowId, selection.propertyId)),
  );
}

export function singleCellSelection(
  coord: CellCoord,
  orderedRowIds: string[],
): CellSelection | null {
  return buildCellSelection(
    coord.propertyId,
    coord.rowId,
    coord.rowId,
    orderedRowIds,
  );
}

export function extendSelection(
  selection: CellSelection,
  focusRowId: string,
  orderedRowIds: string[],
): CellSelection | null {
  return buildCellSelection(
    selection.propertyId,
    selection.anchorRowId,
    focusRowId,
    orderedRowIds,
  );
}

/** Top row of the selection in display order (paste origin). */
export function selectionTopCoord(
  selection: CellSelection,
): CellCoord | null {
  if (selection.rowIds.length === 0) return null;
  return { rowId: selection.rowIds[0], propertyId: selection.propertyId };
}
