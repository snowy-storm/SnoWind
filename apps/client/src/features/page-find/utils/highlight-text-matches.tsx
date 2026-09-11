import { type ReactNode, useMemo } from "react";
import { useAtomValue } from "jotai";
import { baseQuickSearchAtom } from "@/features/page-find/atoms/page-find-atom";
import { findTextMatches } from "@/features/page-find/utils/text-matches";
import classes from "./highlight-text-matches.module.css";

/** Wrap needle ranges in yellow marks; empty query returns plain text. */
export function highlightTextMatches(
  text: string,
  query: string,
  caseSensitive = false,
): ReactNode {
  const needle = query.trim();
  if (!needle || !text) return text;

  const matches = findTextMatches(text, needle, caseSensitive);
  if (matches.length === 0) return text;

  const nodes: ReactNode[] = [];
  let last = 0;
  for (let i = 0; i < matches.length; i++) {
    const { start, end } = matches[i];
    if (start > last) {
      nodes.push(text.slice(last, start));
    }
    nodes.push(
      <mark key={`${start}-${i}`} className={classes.match}>
        {text.slice(start, end)}
      </mark>,
    );
    last = end;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

/** Highlight against the active Base quick-search query. */
export function useBaseSearchHighlight(text: string): ReactNode {
  const query = useAtomValue(baseQuickSearchAtom);
  return useMemo(
    () => highlightTextMatches(text, query),
    [text, query],
  );
}
