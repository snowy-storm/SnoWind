export type TextMatch = { start: number; end: number };

export function findTextMatches(
  haystack: string,
  needle: string,
  caseSensitive = false,
): TextMatch[] {
  if (!needle) return [];

  const matches: TextMatch[] = [];
  if (caseSensitive) {
    let from = 0;
    while (from <= haystack.length) {
      const start = haystack.indexOf(needle, from);
      if (start === -1) break;
      const end = start + needle.length;
      matches.push({ start, end });
      from = start + Math.max(needle.length, 1);
    }
    return matches;
  }

  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  while (from <= lowerHay.length) {
    const start = lowerHay.indexOf(lowerNeedle, from);
    if (start === -1) break;
    const end = start + needle.length;
    matches.push({ start, end });
    from = start + Math.max(needle.length, 1);
  }
  return matches;
}
