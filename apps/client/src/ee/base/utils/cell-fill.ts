import type { CellCoord } from "@/ee/base/types/base.types";

export function cloneCellValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneCellValue);
  if (value !== null && typeof value === "object") {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
}

export function fillCellKey(rowId: string, propertyId: string): string {
  return `${rowId}\0${propertyId}`;
}

/** Vertical fill range in the same column (Excel-style drag down/up). */
export function computeVerticalFillRange(
  orderedRowIds: string[],
  sourceRowId: string,
  targetRowId: string,
  propertyId: string,
): { rowIds: string[]; cellKeys: string[] } | null {
  const sourceIdx = orderedRowIds.indexOf(sourceRowId);
  const targetIdx = orderedRowIds.indexOf(targetRowId);
  if (sourceIdx < 0 || targetIdx < 0) return null;

  const lo = Math.min(sourceIdx, targetIdx);
  const hi = Math.max(sourceIdx, targetIdx);
  const rowIds = orderedRowIds.slice(lo, hi + 1);
  return {
    rowIds,
    cellKeys: rowIds.map((id) => fillCellKey(id, propertyId)),
  };
}

export function parseBaseCellFromPoint(
  clientX: number,
  clientY: number,
): CellCoord | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!(el instanceof Element)) return null;
  const cell = el.closest<HTMLElement>("[data-base-row-id][data-base-property-id]");
  if (!cell) return null;
  const rowId = cell.dataset.baseRowId;
  const propertyId = cell.dataset.basePropertyId;
  if (!rowId || !propertyId) return null;
  return { rowId, propertyId };
}
