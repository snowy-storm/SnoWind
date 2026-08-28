import * as path from 'path';
import {
  buildAttachmentBasenameIndex,
  collectCoLocatedMediaPaths,
  getDrawingNodeType,
  isImageFileName,
  isRemoteOrEmbeddedUrl,
  resolveRelativeAttachmentPath,
} from './import.utils';

const FILE_ID = '11111111-1111-4111-8111-111111111111';

function candidates(relPaths: string[]) {
  const map = new Map<string, string>();
  for (const rel of relPaths) {
    map.set(rel, path.posix.join('/tmp', rel));
  }
  return map;
}

describe('resolveRelativeAttachmentPath', () => {
  it('matches SnoWind export paths from nested pages', () => {
    const map = candidates([`files/${FILE_ID}/photo.png`]);

    expect(
      resolveRelativeAttachmentPath(
        `files/${FILE_ID}/photo.png`,
        'Parent',
        map,
      ),
    ).toBe(`files/${FILE_ID}/photo.png`);
  });

  it('matches files inside a zip wrapper folder from a nested page', () => {
    const map = candidates([`SpaceExport/files/${FILE_ID}/photo.png`]);

    expect(
      resolveRelativeAttachmentPath(
        `files/${FILE_ID}/photo.png`,
        'SpaceExport/Parent',
        map,
      ),
    ).toBe(`SpaceExport/files/${FILE_ID}/photo.png`);
  });

  it('maps /api/files and query strings back to archive files', () => {
    const map = candidates([`files/${FILE_ID}/photo.png`]);

    expect(
      resolveRelativeAttachmentPath(
        `/api/files/${FILE_ID}/photo.png?t=123`,
        '.',
        map,
      ),
    ).toBe(`files/${FILE_ID}/photo.png`);
  });

  it('resolves by old attachment id when the src is stale', () => {
    const map = candidates([`files/${FILE_ID}/diagram.drawio.svg`]);

    expect(
      resolveRelativeAttachmentPath('broken-path.png', 'Parent', map, {
        attachmentId: FILE_ID,
      }),
    ).toBe(`files/${FILE_ID}/diagram.drawio.svg`);
  });

  it('falls back to a unique basename', () => {
    const map = candidates(['assets/unique-shot.png']);
    const byBasename = buildAttachmentBasenameIndex(map);

    expect(
      resolveRelativeAttachmentPath('unique-shot.png', 'notes', map, {
        byBasename,
      }),
    ).toBe('assets/unique-shot.png');
  });

  it('keeps Confluence download/attachments paths working', () => {
    const map = candidates(['attachments/222/image.png']);

    expect(
      resolveRelativeAttachmentPath(
        '/download/attachments/222/image.png',
        '.',
        map,
      ),
    ).toBe('attachments/222/image.png');
  });
});

describe('drawing and image helpers', () => {
  it('detects drawio and excalidraw filenames', () => {
    expect(getDrawingNodeType('diagram.drawio.svg')).toBe('drawio');
    expect(getDrawingNodeType('sketch.excalidraw.svg')).toBe('excalidraw');
    expect(getDrawingNodeType('photo.png')).toBeNull();
  });

  it('does not treat drawing svgs as plain images', () => {
    expect(isImageFileName('diagram.drawio.svg')).toBe(false);
    expect(isImageFileName('photo.png')).toBe(true);
  });

  it('collects co-located images and drawings', () => {
    const map = candidates([
      'Parent/photo.png',
      'Parent/diagram.drawio.svg',
      'files/other.png',
    ]);

    expect(collectCoLocatedMediaPaths('Parent/page.md', map).sort()).toEqual([
      'Parent/diagram.drawio.svg',
      'Parent/photo.png',
    ]);
  });

  it('ignores remote urls', () => {
    expect(isRemoteOrEmbeddedUrl('https://example.com/a.png')).toBe(true);
    expect(isRemoteOrEmbeddedUrl('files/id/a.png')).toBe(false);
  });
});
