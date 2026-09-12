import { jsonToNode } from '../../../collaboration/collaboration.util';
import { isAttachmentNode } from '../../../common/helpers/prosemirror/utils';
import { Node as PMNode } from '@tiptap/pm/model';
import { extractAttachmentIdFromUrl } from '../../export/archive/archive.utils';

export type ArchivePageMapEntry = {
  newPageId: string;
  newSlugId: string;
};

/**
 * Remap ProseMirror JSON attachment IDs, file URLs, page mentions,
 * base embeds, and transclusion references using export→import ID maps.
 */
export function remapArchiveContent(
  content: unknown,
  pageMap: Map<string, ArchivePageMapEntry>,
  attachmentMap: Map<string, { newAttachmentId: string; newFileName: string }>,
): unknown {
  const prosemirrorJson =
    content && typeof content === 'object'
      ? content
      : { type: 'doc', content: [{ type: 'paragraph' }] };

  let doc: PMNode;
  try {
    doc = jsonToNode(prosemirrorJson);
  } catch {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  if (!doc) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  const replaceFileUrl = (url: string | null | undefined): string | null => {
    if (!url || typeof url !== 'string') return url ?? null;
    const oldId = extractAttachmentIdFromUrl(url);
    if (!oldId) return url;
    const mapped = attachmentMap.get(oldId);
    if (!mapped) return url;
    return url.replace(
      new RegExp(`((?:/api)?/files/)${oldId}/[^/?#]+`),
      `$1${mapped.newAttachmentId}/${mapped.newFileName}`,
    );
  };

  doc.descendants((node: PMNode) => {
    if (isAttachmentNode(node.type.name)) {
      const oldAttachmentId = node.attrs.attachmentId as string | null;
      if (oldAttachmentId && attachmentMap.has(oldAttachmentId)) {
        const mapped = attachmentMap.get(oldAttachmentId)!;
        // @ts-ignore
        node.attrs.attachmentId = mapped.newAttachmentId;
        if (node.attrs.src) {
          // @ts-ignore
          node.attrs.src = replaceFileUrl(node.attrs.src);
        }
        if (node.attrs.url) {
          // @ts-ignore
          node.attrs.url = replaceFileUrl(node.attrs.url);
        }
      } else {
        if (node.attrs.src) {
          // @ts-ignore
          node.attrs.src = replaceFileUrl(node.attrs.src);
        }
        if (node.attrs.url) {
          // @ts-ignore
          node.attrs.url = replaceFileUrl(node.attrs.url);
        }
      }
    }

    if (node.type.name === 'mention' && node.attrs.entityType === 'page') {
      const entityId = node.attrs.entityId as string | null;
      if (entityId && pageMap.has(entityId)) {
        const mapped = pageMap.get(entityId)!;
        // @ts-ignore
        node.attrs.entityId = mapped.newPageId;
        // @ts-ignore
        node.attrs.slugId = mapped.newSlugId;
      }
    }

    if (node.type.name === 'base') {
      const pageId = node.attrs.pageId as string | null;
      if (pageId && pageMap.has(pageId)) {
        // @ts-ignore
        node.attrs.pageId = pageMap.get(pageId)!.newPageId;
      }
    }

    if (node.type.name === 'transclusionReference') {
      const sourcePageId = node.attrs.sourcePageId as string | null;
      if (sourcePageId && pageMap.has(sourcePageId)) {
        // @ts-ignore
        node.attrs.sourcePageId = pageMap.get(sourcePageId)!.newPageId;
      }
    }
  });

  return doc.toJSON();
}

export function remapCoverPhoto(
  coverPhoto: string | null | undefined,
  attachmentMap: Map<string, { newAttachmentId: string; newFileName: string }>,
): string | null {
  if (!coverPhoto) return null;
  const oldId = extractAttachmentIdFromUrl(coverPhoto);
  if (!oldId || !attachmentMap.has(oldId)) return coverPhoto;
  const mapped = attachmentMap.get(oldId)!;
  return `/api/files/${mapped.newAttachmentId}/${mapped.newFileName}`;
}

export function remapBaseCells(
  cells: Record<string, unknown>,
  properties: Array<{ id: string; type: string }>,
  pageMap: Map<string, ArchivePageMapEntry>,
  attachmentMap: Map<string, { newAttachmentId: string; newFileName: string }>,
): Record<string, unknown> {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const next: Record<string, unknown> = { ...cells };

  for (const [propId, value] of Object.entries(next)) {
    const prop = propertyById.get(propId);
    if (!prop) continue;

    if (prop.type === 'page' && typeof value === 'string') {
      const mapped = pageMap.get(value);
      if (mapped) next[propId] = mapped.newPageId;
    } else if (prop.type === 'file' && Array.isArray(value)) {
      next[propId] = value.map((file) => {
        if (!file || typeof file !== 'object') return file;
        const id = (file as { id?: unknown }).id;
        if (typeof id !== 'string') return file;
        const mapped = attachmentMap.get(id);
        if (!mapped) return file;
        return {
          ...file,
          id: mapped.newAttachmentId,
          url: undefined,
        };
      });
    }
  }

  return next;
}
