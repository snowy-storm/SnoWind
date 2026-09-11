import type {
  BasePropertyType,
  FilterCondition,
  FilterGroup,
  IBaseProperty,
} from "@/ee/base/types/base.types";

const SEARCHABLE_TYPES = new Set<BasePropertyType>([
  "text",
  "longText",
  "url",
  "email",
  "autoNumber",
]);

export function isSearchablePropertyType(type: BasePropertyType): boolean {
  return SEARCHABLE_TYPES.has(type);
}

export function buildQuickSearchFilter(
  properties: IBaseProperty[],
  query: string,
): FilterGroup | undefined {
  const q = query.trim();
  if (!q) return undefined;

  const children: FilterCondition[] = properties
    .filter((property) => isSearchablePropertyType(property.type))
    .map((property) => ({
      propertyId: property.id,
      op: "contains",
      value: q,
    }));

  if (children.length === 0) return undefined;
  return { op: "or", children };
}

function isEmptyFilterGroup(filter: FilterGroup | undefined): boolean {
  return !filter || filter.children.length === 0;
}

/** Combine view filter with quick-search OR group. Quick search is never alone-persisted. */
export function mergeViewFilterWithQuickSearch(
  viewFilter: FilterGroup | undefined,
  quickSearch: FilterGroup | undefined,
): FilterGroup | undefined {
  if (!quickSearch) {
    return isEmptyFilterGroup(viewFilter) ? undefined : viewFilter;
  }
  if (isEmptyFilterGroup(viewFilter)) {
    return quickSearch;
  }
  return { op: "and", children: [viewFilter!, quickSearch] };
}
