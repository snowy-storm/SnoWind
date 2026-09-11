import {
  buildQuickSearchFilter,
  mergeViewFilterWithQuickSearch,
} from "./build-quick-search-filter";
import type { IBaseProperty } from "@/ee/base/types/base.types";

describe("buildQuickSearchFilter", () => {
  const properties = [
    { id: "a", type: "text" },
    { id: "b", type: "number" },
    { id: "c", type: "email" },
  ] as IBaseProperty[];

  it("returns undefined for empty query", () => {
    expect(buildQuickSearchFilter(properties, "  ")).toBeUndefined();
  });

  it("builds OR contains across searchable properties", () => {
    expect(buildQuickSearchFilter(properties, "hello")).toEqual({
      op: "or",
      children: [
        { propertyId: "a", op: "contains", value: "hello" },
        { propertyId: "c", op: "contains", value: "hello" },
      ],
    });
  });

  it("returns undefined when no searchable columns", () => {
    expect(
      buildQuickSearchFilter([{ id: "n", type: "number" } as IBaseProperty], "x"),
    ).toBeUndefined();
  });
});

describe("mergeViewFilterWithQuickSearch", () => {
  const view = {
    op: "and" as const,
    children: [{ propertyId: "x", op: "eq" as const, value: 1 }],
  };
  const quick = {
    op: "or" as const,
    children: [{ propertyId: "a", op: "contains" as const, value: "q" }],
  };

  it("returns view filter when quick search empty", () => {
    expect(mergeViewFilterWithQuickSearch(view, undefined)).toEqual(view);
  });

  it("returns quick search when view empty", () => {
    expect(mergeViewFilterWithQuickSearch(undefined, quick)).toEqual(quick);
    expect(
      mergeViewFilterWithQuickSearch({ op: "and", children: [] }, quick),
    ).toEqual(quick);
  });

  it("ANDs view filter with quick search", () => {
    expect(mergeViewFilterWithQuickSearch(view, quick)).toEqual({
      op: "and",
      children: [view, quick],
    });
  });
});
