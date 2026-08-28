import { Row } from "@tanstack/react-table";
import {
  IBaseProperty,
  IBaseRow,
  SelectTypeOptions,
  ViewGroupConfig,
  isFormulaErrorCell,
  DateTypeOptions,
  NumberTypeOptions,
  RowReferences,
} from "@/ee/base/types/base.types";
import {
  isFillablePropertyType,
  systemAccessorFor,
} from "@/ee/base/property-types/property-type.registry";
import { formatDateDisplay, formatNumber, formatTimestamp } from "@/ee/base/formatters/cell-formatters";

export const EMPTY_GROUP_KEY = "__empty__";

export type TableGroupHeaderItem = {
  kind: "group";
  id: string;
  depth: number;
  count: number;
  collapsed: boolean;
  property: IBaseProperty;
  rawValue: unknown;
};

export type TableGroupRowItem = {
  kind: "row";
  id: string;
  row: Row<IBaseRow>;
  rowNumber: number;
};

export type TableAddRowItem = {
  kind: "add-row";
  id: string;
  depth: number;
  afterRowId?: string;
  cells: Record<string, unknown>;
};

export type TableDisplayItem =
  | TableGroupHeaderItem
  | TableGroupRowItem
  | TableAddRowItem;

export function getGroupCellValue(
  row: IBaseRow,
  property: IBaseProperty,
): unknown {
  const sys = systemAccessorFor(property.type);
  if (sys) return sys(row);
  return row.cells[property.id];
}

export function isEmptyGroupValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : v == null ? "" : String(v)))
      .filter(Boolean)
      .sort();
  }
  if (typeof value === "string" && value) return [value];
  return [];
}

export function groupKeyFor(property: IBaseProperty, value: unknown): string {
  if (isEmptyGroupValue(value)) return EMPTY_GROUP_KEY;
  if (
    property.type === "multiSelect" ||
    property.type === "person" ||
    property.type === "lastEditedBy"
  ) {
    return JSON.stringify(normalizeIdList(value));
  }
  if (property.type === "file") {
    if (!Array.isArray(value)) return EMPTY_GROUP_KEY;
    const ids = value
      .map((f) =>
        f && typeof f === "object" && "id" in f
          ? String((f as { id: unknown }).id)
          : "",
      )
      .filter(Boolean)
      .sort();
    return ids.length === 0 ? EMPTY_GROUP_KEY : JSON.stringify(ids);
  }
  if (property.type === "checkbox") {
    return value === true ? "true" : "false";
  }
  if (isFormulaErrorCell(value)) {
    return `__err:${value.__err}`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function choiceIndex(property: IBaseProperty, id: string): number {
  const opts = property.typeOptions as SelectTypeOptions | undefined;
  const order = opts?.choiceOrder?.length
    ? opts.choiceOrder
    : (opts?.choices ?? []).map((c) => c.id);
  const idx = order.indexOf(id);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function compareGroupValues(
  property: IBaseProperty,
  a: unknown,
  b: unknown,
  direction: "asc" | "desc",
): number {
  const aEmpty = isEmptyGroupValue(a);
  const bEmpty = isEmptyGroupValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const dir = direction === "desc" ? -1 : 1;

  if (property.type === "number") {
    const na = typeof a === "number" ? a : Number(a);
    const nb = typeof b === "number" ? b : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
  }

  if (
    property.type === "date" ||
    property.type === "createdAt" ||
    property.type === "lastEditedAt"
  ) {
    const ta = Date.parse(String(a));
    const tb = Date.parse(String(b));
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return (ta - tb) * dir;
  }

  if (property.type === "checkbox") {
    const av = a === true ? 1 : 0;
    const bv = b === true ? 1 : 0;
    return (av - bv) * dir;
  }

  if (property.type === "select" || property.type === "status") {
    const ia = choiceIndex(property, String(a));
    const ib = choiceIndex(property, String(b));
    if (ia !== ib) return (ia - ib) * dir;
  }

  if (property.type === "multiSelect") {
    const ia = Math.min(
      ...normalizeIdList(a).map((id) => choiceIndex(property, id)),
      Number.MAX_SAFE_INTEGER,
    );
    const ib = Math.min(
      ...normalizeIdList(b).map((id) => choiceIndex(property, id)),
      Number.MAX_SAFE_INTEGER,
    );
    if (ia !== ib) return (ia - ib) * dir;
  }

  return (
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    }) * dir
  );
}

export function formatGroupLabel(
  property: IBaseProperty,
  value: unknown,
  t: (key: string) => string,
  references: RowReferences,
): string {
  if (isEmptyGroupValue(value)) return t("No value");
  if (isFormulaErrorCell(value)) return `#ERROR`;

  switch (property.type) {
    case "select":
    case "status": {
      const opts = property.typeOptions as SelectTypeOptions | undefined;
      const choice = opts?.choices?.find((c) => c.id === value);
      return choice?.name ?? String(value);
    }
    case "multiSelect": {
      const opts = property.typeOptions as SelectTypeOptions | undefined;
      const names = normalizeIdList(value).map(
        (id) => opts?.choices?.find((c) => c.id === id)?.name ?? id,
      );
      return names.join(", ");
    }
    case "person":
    case "lastEditedBy": {
      const names = normalizeIdList(value).map((id) => {
        const user = references.users[id];
        return user?.name || id.slice(0, 8);
      });
      return names.join(", ");
    }
    case "page": {
      if (typeof value !== "string") return String(value);
      const page = references.pages[value];
      return page?.title || t("Untitled");
    }
    case "checkbox":
      return value === true ? t("Checked") : t("Unchecked");
    case "number":
      return formatNumber(
        typeof value === "number" ? value : Number(value),
        property.typeOptions as NumberTypeOptions | undefined,
      );
    case "date":
      return formatDateDisplay(
        typeof value === "string" ? value : null,
        property.typeOptions as DateTypeOptions | undefined,
      );
    case "createdAt":
    case "lastEditedAt":
      return formatTimestamp(typeof value === "string" ? value : null);
    case "file": {
      if (!Array.isArray(value)) return t("No value");
      const names = value
        .map((f) =>
          f && typeof f === "object" && "fileName" in f
            ? String((f as { fileName: unknown }).fileName)
            : "",
        )
        .filter(Boolean);
      return names.length > 0 ? names.join(", ") : t("No value");
    }
    default:
      if (typeof value === "boolean") {
        return value ? t("Checked") : t("Unchecked");
      }
      if (typeof value === "number") return String(value);
      if (typeof value === "string") return value;
      return String(value);
  }
}

type Bucket = { key: string; value: unknown; rows: Row<IBaseRow>[] };

function bucketRows(
  rows: Row<IBaseRow>[],
  property: IBaseProperty,
  direction: "asc" | "desc",
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const value = getGroupCellValue(row.original, property);
    const key = groupKeyFor(property, value);
    const existing = map.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(key, { key, value, rows: [row] });
    }
  }
  return [...map.values()].sort((a, b) =>
    compareGroupValues(property, a.value, b.value, direction),
  );
}

function cellValueForGroup(
  property: IBaseProperty,
  value: unknown,
): unknown | undefined {
  if (!isFillablePropertyType(property.type)) return undefined;
  if (isEmptyGroupValue(value)) return null;
  return value;
}

export function buildTableDisplayItems(
  rows: Row<IBaseRow>[],
  groups: ViewGroupConfig[],
  properties: IBaseProperty[],
  collapsedIds: ReadonlySet<string>,
  includeAddRows = false,
): TableDisplayItem[] {
  if (groups.length === 0) {
    return rows.map((row, i) => ({
      kind: "row" as const,
      id: row.id,
      row,
      rowNumber: i,
    }));
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const items: TableDisplayItem[] = [];
  let rowNumber = 0;

  const walk = (
    source: Row<IBaseRow>[],
    depth: number,
    parentId: string,
    ancestorCells: Record<string, unknown>,
  ) => {
    const spec = groups[depth];
    const property = propertyById.get(spec.propertyId);
    if (!property) {
      for (const row of source) {
        items.push({ kind: "row", id: row.id, row, rowNumber: rowNumber++ });
      }
      return;
    }

    const buckets = bucketRows(source, property, spec.direction);
    for (const bucket of buckets) {
      const id = parentId
        ? `${parentId}/${spec.propertyId}:${bucket.key}`
        : `${spec.propertyId}:${bucket.key}`;
      const collapsed = collapsedIds.has(id);
      items.push({
        kind: "group",
        id,
        depth,
        count: bucket.rows.length,
        collapsed,
        property,
        rawValue: bucket.value,
      });
      if (collapsed) continue;

      const nextCells = { ...ancestorCells };
      const cellValue = cellValueForGroup(property, bucket.value);
      if (cellValue !== undefined) {
        nextCells[property.id] = cellValue;
      }

      if (depth + 1 < groups.length) {
        walk(bucket.rows, depth + 1, id, nextCells);
      } else {
        for (const row of bucket.rows) {
          items.push({ kind: "row", id: row.id, row, rowNumber: rowNumber++ });
        }
        if (includeAddRows) {
          const last = bucket.rows[bucket.rows.length - 1];
          items.push({
            kind: "add-row",
            id: `${id}/__add`,
            depth,
            afterRowId: last?.id,
            cells: nextCells,
          });
        }
      }
    }
  };

  walk(rows, 0, "", {});
  return items;
}
