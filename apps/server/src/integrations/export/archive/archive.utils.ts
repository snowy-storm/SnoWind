import { validate as isValidUUID } from 'uuid';
import {
  getAttachmentIds,
  getProsemirrorContent,
} from '../../../common/helpers/prosemirror/utils';

/** Extract attachment UUID from coverPhoto or /api/files/... URL. */
export function extractAttachmentIdFromUrl(
  value: string | null | undefined,
): string | null {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/\/(?:api\/)?files\/([^/?#]+)/);
  if (!match?.[1] || !isValidUUID(match[1])) return null;
  return match[1];
}

export function collectPageAttachmentIds(page: {
  content: unknown;
  coverPhoto?: string | null;
}): string[] {
  const ids = new Set<string>();
  for (const id of getAttachmentIds(getProsemirrorContent(page.content))) {
    ids.add(id);
  }
  const coverId = extractAttachmentIdFromUrl(page.coverPhoto);
  if (coverId) ids.add(coverId);
  return [...ids];
}

/** BFS topological order: roots first, then children by position. */
export function topologicalPageOrder(
  pages: Array<{ id: string; parentPageId: string | null; position: string }>,
): string[] {
  const byParent = new Map<string | null, typeof pages>();
  for (const page of pages) {
    const key = page.parentPageId;
    const list = byParent.get(key) ?? [];
    list.push(page);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
  }

  const ordered: string[] = [];
  const queue = [...(byParent.get(null) ?? [])];
  // Orphaned pages (parent not in export set) — treat as roots
  const pageIds = new Set(pages.map((p) => p.id));
  for (const page of pages) {
    if (
      page.parentPageId &&
      !pageIds.has(page.parentPageId) &&
      !queue.some((p) => p.id === page.id)
    ) {
      queue.push(page);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const page = queue.shift()!;
    if (visited.has(page.id)) continue;
    visited.add(page.id);
    ordered.push(page.id);
    for (const child of byParent.get(page.id) ?? []) {
      queue.push(child);
    }
  }
  return ordered;
}
