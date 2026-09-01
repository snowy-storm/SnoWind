import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Matches `CustomTable.configure({ cellMinWidth })` in the page editor. */
export const TABLE_CELL_MIN_WIDTH = 49;

const CONTAINED_PARENTS = new Set([
  'table',
  'column',
  'callout',
  'details',
]);

export function measureTableNodeWidth(
  node: ProseMirrorNode,
  cellMinWidth = TABLE_CELL_MIN_WIDTH,
): number {
  const row = node.firstChild;
  if (!row) return 0;

  let total = 0;
  for (let i = 0; i < row.childCount; i += 1) {
    const { colspan, colwidth } = row.child(i).attrs;
    for (let j = 0; j < colspan; j += 1) {
      total += (colwidth && colwidth[j]) || cellMinWidth;
    }
  }
  return total;
}

/**
 * Widest top-level editor table. Nested tables and tables inside
 * columns / callouts / details do not drive page column width.
 */
export function maxTopLevelTableWidth(
  doc: ProseMirrorNode,
  cellMinWidth = TABLE_CELL_MIN_WIDTH,
): number {
  let max = 0;

  const walk = (node: ProseMirrorNode, contained: boolean) => {
    if (node.type.name === 'table' && !contained) {
      max = Math.max(max, measureTableNodeWidth(node, cellMinWidth));
    }
    const nextContained = contained || CONTAINED_PARENTS.has(node.type.name);
    node.forEach((child) => walk(child, nextContained));
  };

  walk(doc, false);
  return max;
}
