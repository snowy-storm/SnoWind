import { InfiniteData } from "@tanstack/react-query";
import { queryClient } from "@/main";
import {
  IBaseProperty,
  IBaseRow,
  UpdateRowInput,
} from "@/ee/base/types/base.types";
import { IBaseRowsPage } from "@/ee/base/services/base-service";
import { flattenRows } from "@/ee/base/queries/base-row-query";
import { isSearchablePropertyType } from "@/features/page-find/utils/build-quick-search-filter";
import {
  applyTextReplaceAll,
  applyTextReplaceAt,
} from "@/features/page-find/mermaid-find-bridge";
import { findTextMatches } from "@/features/page-find/utils/text-matches";

type ReplaceInBaseCellsArgs = {
  pageId: string;
  properties: IBaseProperty[];
  needle: string;
  replacement: string;
  caseSensitive: boolean;
  replaceAll: boolean;
  updateRow: (input: UpdateRowInput) => Promise<unknown>;
};

function cellAsString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function replaceInBaseCells({
  pageId,
  properties,
  needle,
  replacement,
  caseSensitive,
  replaceAll,
  updateRow,
}: ReplaceInBaseCellsArgs): Promise<number> {
  const q = needle.trim();
  if (!q) return 0;

  const searchableIds = new Set(
    properties.filter((p) => isSearchablePropertyType(p.type)).map((p) => p.id),
  );
  if (searchableIds.size === 0) return 0;

  const caches = queryClient.getQueriesData<InfiniteData<IBaseRowsPage>>({
    queryKey: ["base-rows", pageId],
  });

  const rowsById = new Map<string, IBaseRow>();
  for (const [, data] of caches) {
    for (const row of flattenRows(data)) {
      rowsById.set(row.id, row);
    }
  }

  let replacedCells = 0;

  for (const row of rowsById.values()) {
    const patch: Record<string, unknown> = {};
    let rowChanged = false;

    for (const propertyId of searchableIds) {
      const raw = cellAsString(row.cells?.[propertyId]);
      if (raw == null) continue;
      const matches = findTextMatches(raw, q, caseSensitive);
      if (matches.length === 0) continue;

      if (replaceAll) {
        const { next, count } = applyTextReplaceAll(
          raw,
          q,
          replacement,
          caseSensitive,
        );
        if (count > 0) {
          patch[propertyId] = next;
          replacedCells += count;
          rowChanged = true;
        }
      } else {
        const { next, count } = applyTextReplaceAt(
          raw,
          0,
          q,
          replacement,
          caseSensitive,
        );
        if (count > 0) {
          patch[propertyId] = next;
          replacedCells += 1;
          rowChanged = true;
          break;
        }
      }
    }

    if (rowChanged) {
      await updateRow({
        pageId,
        rowId: row.id,
        cells: patch,
      });
      if (!replaceAll) break;
    }
  }

  return replacedCells;
}
