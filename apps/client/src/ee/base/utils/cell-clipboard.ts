import type {
  BasePropertyType,
  Choice,
  IBaseProperty,
  PersonTypeOptions,
  SelectTypeOptions,
} from "@/ee/base/types/base.types";
import { isFillablePropertyType } from "@/ee/base/property-types/property-type.registry";
import { cloneCellValue } from "@/ee/base/utils/cell-fill";

export type CellClipboardPayload = {
  propertyType: BasePropertyType;
  /** One or more values in display-row order (same column). */
  values: unknown[];
  /** Snapshot of source select/status/multiSelect choices for id→label remapping. */
  choices?: Choice[];
  allowMultiple?: boolean;
};

const TEXT_LIKE = new Set<BasePropertyType>([
  "text",
  "longText",
  "url",
  "email",
]);

export function canCopyProperty(property: IBaseProperty | undefined): boolean {
  return !!property && isFillablePropertyType(property.type);
}

export function canPasteIntoProperty(property: IBaseProperty | undefined): boolean {
  return !!property && isFillablePropertyType(property.type);
}

export function buildCellClipboardPayload(
  property: IBaseProperty,
  values: unknown[],
): CellClipboardPayload {
  const payload: CellClipboardPayload = {
    propertyType: property.type,
    values: values.map(cloneCellValue),
  };

  if (
    property.type === "select" ||
    property.type === "status" ||
    property.type === "multiSelect"
  ) {
    const opts = property.typeOptions as SelectTypeOptions;
    payload.choices = Array.isArray(opts?.choices)
      ? opts.choices.map((c) => ({ ...c }))
      : [];
  }

  if (property.type === "person") {
    payload.allowMultiple = !!(property.typeOptions as PersonTypeOptions)
      ?.allowMultiple;
  }

  return payload;
}

export function clipboardToPlainText(payload: CellClipboardPayload): string {
  return payload.values
    .map((value) => valueToPlainText(value, payload.propertyType, payload.choices))
    .join("\n");
}

function valueToPlainText(
  value: unknown,
  propertyType: BasePropertyType,
  choices?: Choice[],
): string {
  if (value == null || value === "") return "";

  if (propertyType === "checkbox") return value ? "true" : "false";

  if (
    (propertyType === "select" || propertyType === "status") &&
    typeof value === "string"
  ) {
    return choices?.find((c) => c.id === value)?.name ?? value;
  }

  if (propertyType === "multiSelect" && Array.isArray(value)) {
    return value
      .map((id) =>
        typeof id === "string"
          ? (choices?.find((c) => c.id === id)?.name ?? id)
          : String(id),
      )
      .join(", ");
  }

  if (propertyType === "file" && Array.isArray(value)) {
    return value
      .map((f) =>
        f && typeof f === "object" && "fileName" in f
          ? String((f as { fileName: string }).fileName)
          : "",
      )
      .filter(Boolean)
      .join(", ");
  }

  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function typesCompatible(
  source: BasePropertyType,
  target: BasePropertyType,
): boolean {
  if (source === target) return true;
  return TEXT_LIKE.has(source) && TEXT_LIKE.has(target);
}

function remapChoiceId(
  id: string,
  sourceChoices: Choice[] | undefined,
  targetChoices: Choice[],
): string | null {
  if (targetChoices.some((c) => c.id === id)) return id;
  const src = sourceChoices?.find((c) => c.id === id);
  if (!src) return null;
  const byName = targetChoices.find((c) => c.name === src.name);
  return byName?.id ?? null;
}

function getTargetChoices(property: IBaseProperty): Choice[] {
  const opts = property.typeOptions as SelectTypeOptions;
  return Array.isArray(opts?.choices) ? opts.choices : [];
}

/**
 * Adapt a single clipboard value for the target property.
 */
export function adaptClipboardValueForTarget(
  payload: Pick<CellClipboardPayload, "propertyType" | "choices" | "allowMultiple">,
  value: unknown,
  target: IBaseProperty,
): { ok: true; value: unknown } | { ok: false; reason: "type" | "empty-map" } {
  if (!typesCompatible(payload.propertyType, target.type)) {
    return { ok: false, reason: "type" };
  }

  const raw = cloneCellValue(value);

  if (target.type === "select" || target.type === "status") {
    if (raw == null || raw === "") return { ok: true, value: null };
    if (typeof raw !== "string") return { ok: false, reason: "type" };
    const mapped = remapChoiceId(raw, payload.choices, getTargetChoices(target));
    if (!mapped) return { ok: false, reason: "empty-map" };
    return { ok: true, value: mapped };
  }

  if (target.type === "multiSelect") {
    const ids = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : typeof raw === "string" && raw
        ? [raw]
        : [];
    const targetChoices = getTargetChoices(target);
    const mapped = ids
      .map((id) => remapChoiceId(id, payload.choices, targetChoices))
      .filter((id): id is string => !!id);
    if (ids.length > 0 && mapped.length === 0) {
      return { ok: false, reason: "empty-map" };
    }
    return { ok: true, value: mapped };
  }

  if (target.type === "person") {
    const targetMulti = !!(target.typeOptions as PersonTypeOptions)?.allowMultiple;
    if (raw == null || raw === "") return { ok: true, value: null };
    if (targetMulti) {
      if (Array.isArray(raw)) return { ok: true, value: raw };
      if (typeof raw === "string") return { ok: true, value: [raw] };
      return { ok: false, reason: "type" };
    }
    if (Array.isArray(raw)) return { ok: true, value: raw[0] ?? null };
    if (typeof raw === "string") return { ok: true, value: raw };
    return { ok: false, reason: "type" };
  }

  if (TEXT_LIKE.has(target.type)) {
    if (raw == null) return { ok: true, value: null };
    if (typeof raw === "string") {
      if (target.type === "longText") {
        return { ok: true, value: raw.trim() === "" ? null : raw };
      }
      if (target.type === "text") return { ok: true, value: raw };
      return { ok: true, value: raw.trim() === "" ? null : raw };
    }
    return { ok: true, value: String(raw) };
  }

  if (target.type === "checkbox") {
    return { ok: true, value: !!raw };
  }

  if (target.type === "number") {
    if (raw == null || raw === "") return { ok: true, value: null };
    if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: raw };
    if (typeof raw === "string") {
      const n = Number(raw);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "type" };
    }
    return { ok: false, reason: "type" };
  }

  return { ok: true, value: raw };
}

/** @deprecated use adaptClipboardValueForTarget — kept name for call-site clarity with single value */
export function adaptClipboardForTarget(
  payload: CellClipboardPayload,
  target: IBaseProperty,
): { ok: true; value: unknown } | { ok: false; reason: "type" | "empty-map" } {
  const first = payload.values[0];
  return adaptClipboardValueForTarget(payload, first, target);
}

/** Try to build a paste value from plain text for text-like / number / checkbox targets. */
export function adaptPlainTextForTarget(
  text: string,
  target: IBaseProperty,
): { ok: true; value: unknown } | { ok: false } {
  if (!isFillablePropertyType(target.type)) return { ok: false };

  if (TEXT_LIKE.has(target.type)) {
    const trimmed = text;
    if (target.type === "text") return { ok: true, value: trimmed };
    return { ok: true, value: trimmed.trim() === "" ? null : trimmed };
  }

  if (target.type === "number") {
    const t = text.trim();
    if (!t) return { ok: true, value: null };
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }

  if (target.type === "checkbox") {
    const t = text.trim().toLowerCase();
    if (["true", "1", "yes", "y", "✓", "checked"].includes(t)) {
      return { ok: true, value: true };
    }
    if (["false", "0", "no", "n", "", "unchecked"].includes(t)) {
      return { ok: true, value: false };
    }
    return { ok: false };
  }

  return { ok: false };
}

/**
 * Resolve destination row ids for paste (Excel-like, same column).
 * - Multi-cell dest selection → that range
 * - Single dest + multi-value clipboard → extend downward from start for values.length
 * - Single dest + single value → just that cell
 */
export function resolvePasteTargetRows(
  orderedRowIds: string[],
  startRowId: string,
  destSelectedRowIds: string[],
  clipboardValueCount: number,
): string[] {
  if (destSelectedRowIds.length > 1) {
    return destSelectedRowIds;
  }

  if (clipboardValueCount <= 1) {
    return destSelectedRowIds.length === 1
      ? destSelectedRowIds
      : [startRowId];
  }

  const startIdx = orderedRowIds.indexOf(startRowId);
  if (startIdx < 0) return [startRowId];
  return orderedRowIds.slice(startIdx, startIdx + clipboardValueCount);
}

/**
 * Map clipboard values onto destination rows.
 * - 1 value → every dest row gets that value
 * - N values + M dest → dest[i] gets values[i % N] when M > N? No — Excel does not tile by default for column paste into larger selection; it pastes once from top.
 *   We paste values[i] for i < min(N,M); if N===1 fill all M; if M===1 and N>1 already expanded via resolvePasteTargetRows.
 */
export function mapClipboardValuesToRows(
  destRowIds: string[],
  values: unknown[],
): Array<{ rowId: string; value: unknown }> {
  if (values.length === 0 || destRowIds.length === 0) return [];

  if (values.length === 1) {
    const v = values[0];
    return destRowIds.map((rowId) => ({ rowId, value: cloneCellValue(v) }));
  }

  const count = Math.min(values.length, destRowIds.length);
  const out: Array<{ rowId: string; value: unknown }> = [];
  for (let i = 0; i < count; i++) {
    out.push({ rowId: destRowIds[i], value: cloneCellValue(values[i]) });
  }
  return out;
}
