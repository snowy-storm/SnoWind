import {
  extractAttachmentIdFromUrl,
  collectPageAttachmentIds,
  topologicalPageOrder,
} from './archive.utils';

describe('archive.utils', () => {
  describe('extractAttachmentIdFromUrl', () => {
    it('extracts id from /api/files URL', () => {
      const id = '018f0000-0000-7000-8000-000000000001';
      expect(
        extractAttachmentIdFromUrl(`/api/files/${id}/photo.png`),
      ).toBe(id);
    });

    it('extracts id from /files URL', () => {
      const id = '018f0000-0000-7000-8000-000000000002';
      expect(extractAttachmentIdFromUrl(`/files/${id}/a.svg`)).toBe(id);
    });

    it('returns null for external URLs', () => {
      expect(extractAttachmentIdFromUrl('https://example.com/x.png')).toBeNull();
      expect(extractAttachmentIdFromUrl(null)).toBeNull();
    });
  });

  describe('topologicalPageOrder', () => {
    it('orders parents before children', () => {
      const root = {
        id: 'p1',
        parentPageId: null as string | null,
        position: 'a0',
      };
      const child = {
        id: 'p2',
        parentPageId: 'p1',
        position: 'a0',
      };
      const grandchild = {
        id: 'p3',
        parentPageId: 'p2',
        position: 'a0',
      };
      expect(topologicalPageOrder([grandchild, child, root])).toEqual([
        'p1',
        'p2',
        'p3',
      ]);
    });

    it('treats orphaned pages as roots', () => {
      const orphan = {
        id: 'o1',
        parentPageId: 'missing',
        position: 'a0',
      };
      expect(topologicalPageOrder([orphan])).toEqual(['o1']);
    });
  });

  describe('collectPageAttachmentIds', () => {
    it('collects from content and coverPhoto', () => {
      const attId = '018f0000-0000-7000-8000-0000000000aa';
      const coverId = '018f0000-0000-7000-8000-0000000000bb';
      const content = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              src: `/api/files/${attId}/img.png`,
              attachmentId: attId,
            },
          },
        ],
      };
      const ids = collectPageAttachmentIds({
        content,
        coverPhoto: `/api/files/${coverId}/cover.jpg`,
      });
      expect(ids).toContain(attId);
      expect(ids).toContain(coverId);
    });
  });
});
