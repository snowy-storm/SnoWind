import { formatNumber } from "@/ee/base/components/cells/cell-number";
import { formatDateDisplay } from "@/ee/base/components/cells/cell-date";
import type { AutoNumberTypeOptions } from "@/ee/base/types/base.types";

export { formatNumber, formatDateDisplay };

/** Pull the sequence integer from a cell (number, or trailing digits in a legacy string). */
export function parseAutoNumberCell(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const match = trimmed.match(/(\d+)\s*$/);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Always render as prefix + zero-padded number from current field options. */
export function formatAutoNumberDisplay(
  value: unknown,
  typeOptions?: AutoNumberTypeOptions | Record<string, unknown> | null,
): string {
  const n = parseAutoNumberCell(value);
  if (n == null) {
    return typeof value === "string" ? value : "";
  }
  const opts = (typeOptions ?? {}) as AutoNumberTypeOptions;
  const prefix = typeof opts.prefix === "string" ? opts.prefix : "";
  const digits =
    typeof opts.digits === "number" && opts.digits > 0
      ? Math.min(Math.floor(opts.digits), 12)
      : 4;
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

export function formatTimestamp(value: string | null | undefined): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatLongTextPreview(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}
