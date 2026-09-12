import {
  isSnowindArchiveManifest,
  SNOWIND_ARCHIVE_SOURCE,
  SNOWIND_ARCHIVE_FORMAT_VERSION,
} from './snowind-archive.types';

describe('snowind-archive.types', () => {
  it('validates a correct manifest', () => {
    expect(
      isSnowindArchiveManifest({
        formatVersion: SNOWIND_ARCHIVE_FORMAT_VERSION,
        source: SNOWIND_ARCHIVE_SOURCE,
        appVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        space: { id: 's1', name: 'Space' },
        pageIds: ['p1'],
        attachmentIds: [],
      }),
    ).toBe(true);
  });

  it('rejects legacy snowind-metadata shape', () => {
    expect(
      isSnowindArchiveManifest({
        source: 'snowind',
        version: '1.0.0',
        pages: {},
      }),
    ).toBe(false);
  });
});
