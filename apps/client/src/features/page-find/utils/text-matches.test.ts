import { findTextMatches } from "./text-matches";

describe("findTextMatches", () => {
  it("returns empty for empty needle", () => {
    expect(findTextMatches("abc", "")).toEqual([]);
  });

  it("finds case-insensitive matches", () => {
    expect(findTextMatches("Hello HELLO", "hello")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it("finds case-sensitive matches", () => {
    expect(findTextMatches("Hello HELLO", "HELLO", true)).toEqual([
      { start: 6, end: 11 },
    ]);
  });
});
