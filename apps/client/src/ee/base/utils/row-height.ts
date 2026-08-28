export type TableRowHeight = "normal" | "tall" | "extraTall";

export const DEFAULT_TABLE_ROW_HEIGHT: TableRowHeight = "normal";

/** Group headers and nested "add row" stay compact regardless of data-row height. */
export const COMPACT_ROW_HEIGHT_PX = 37;

export const TABLE_ROW_HEIGHT_OPTIONS = [
  { value: "normal", label: "Normal", px: 46, lineClamp: 2 },
  { value: "tall", label: "Tall", px: 92, lineClamp: 4 },
  { value: "extraTall", label: "Extra tall", px: 138, lineClamp: null },
] as const;

const HEIGHT_SET = new Set<string>(
  TABLE_ROW_HEIGHT_OPTIONS.map((option) => option.value),
);

export function parseTableRowHeight(value: unknown): TableRowHeight {
  if (typeof value === "string" && HEIGHT_SET.has(value)) {
    return value as TableRowHeight;
  }
  return DEFAULT_TABLE_ROW_HEIGHT;
}

export function rowHeightPx(value: unknown): number {
  const key = parseTableRowHeight(value);
  return TABLE_ROW_HEIGHT_OPTIONS.find((option) => option.value === key)!.px;
}

export function rowHeightLineClamp(value: unknown): number | null {
  const key = parseTableRowHeight(value);
  return TABLE_ROW_HEIGHT_OPTIONS.find((option) => option.value === key)!
    .lineClamp;
}
