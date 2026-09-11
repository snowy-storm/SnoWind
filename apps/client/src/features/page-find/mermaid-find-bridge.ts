import { findTextMatches } from "@/features/page-find/utils/text-matches";

export type MermaidFindBridge = {
  getSource: () => string;
  selectRange: (start: number, end: number) => void;
  replaceCurrent: (
    index: number,
    needle: string,
    replacement: string,
    caseSensitive: boolean,
  ) => number;
  replaceAll: (
    needle: string,
    replacement: string,
    caseSensitive: boolean,
  ) => number;
};

let bridge: MermaidFindBridge | null = null;
const listeners = new Set<() => void>();

export function registerMermaidFindBridge(next: MermaidFindBridge | null) {
  bridge = next;
  listeners.forEach((listener) => listener());
}

export function getMermaidFindBridge() {
  return bridge;
}

export function subscribeMermaidFindBridge(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyTextReplaceAll(
  haystack: string,
  needle: string,
  replacement: string,
  caseSensitive: boolean,
): { next: string; count: number } {
  if (!needle) return { next: haystack, count: 0 };
  const matches = findTextMatches(haystack, needle, caseSensitive);
  if (matches.length === 0) return { next: haystack, count: 0 };

  let next = "";
  let cursor = 0;
  for (const match of matches) {
    next += haystack.slice(cursor, match.start) + replacement;
    cursor = match.end;
  }
  next += haystack.slice(cursor);
  return { next, count: matches.length };
}

export function applyTextReplaceAt(
  haystack: string,
  matchIndex: number,
  needle: string,
  replacement: string,
  caseSensitive: boolean,
): { next: string; nextIndex: number; count: number } {
  const matches = findTextMatches(haystack, needle, caseSensitive);
  if (matches.length === 0) {
    return { next: haystack, nextIndex: 0, count: 0 };
  }
  const safe =
    ((matchIndex % matches.length) + matches.length) % matches.length;
  const match = matches[safe];
  const next =
    haystack.slice(0, match.start) + replacement + haystack.slice(match.end);
  const remaining = findTextMatches(next, needle, caseSensitive);
  const nextIndex =
    remaining.length === 0 ? 0 : Math.min(safe, remaining.length - 1);
  return { next, nextIndex, count: matches.length };
}
