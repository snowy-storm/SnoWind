import {
  buildPageCollectionSchema,
  buildPageFilterBy,
  buildSearchQueryBy,
  extractHighlight,
  isBrowseByFilters,
  isCjkLocale,
  normalizeHighlight,
  parseTypesenseUrl,
  toPageDocument,
  toUnixSeconds,
} from './typesense.utils';

describe('typesense.utils', () => {
  describe('parseTypesenseUrl', () => {
    it('parses host, port and protocol', () => {
      expect(parseTypesenseUrl('http://localhost:8108')).toEqual({
        host: 'localhost',
        port: 8108,
        protocol: 'http',
      });
    });

    it('defaults https port to 443', () => {
      expect(parseTypesenseUrl('https://search.example.com')).toEqual({
        host: 'search.example.com',
        port: 443,
        protocol: 'https',
      });
    });
  });

  describe('locale helpers', () => {
    it('treats zh/ja/ko as CJK', () => {
      expect(isCjkLocale('zh')).toBe(true);
      expect(isCjkLocale('ja')).toBe(true);
      expect(isCjkLocale('en')).toBe(false);
    });

    it('puts the locale on searchable text fields', () => {
      const schema = buildPageCollectionSchema('zh');
      const title = schema.fields.find((field) => field.name === 'title');
      const content = schema.fields.find((field) => field.name === 'textContent');

      expect(schema.metadata).toEqual({ locale: 'zh' });
      expect(title?.locale).toBe('zh');
      expect(content?.locale).toBe('zh');
    });
  });

  describe('toPageDocument', () => {
    it('maps page fields and truncates missing values', () => {
      const createdAt = new Date('2026-01-02T03:04:05.000Z');
      const doc = toPageDocument({
        id: 'page-1',
        slugId: 'slug-1',
        title: '中文标题',
        textContent: '正文内容',
        icon: null,
        parentPageId: null,
        creatorId: 'user-1',
        spaceId: 'space-1',
        workspaceId: 'ws-1',
        createdAt,
        updatedAt: createdAt,
        labelIds: ['label-1'],
      });

      expect(doc).toMatchObject({
        id: 'page-1',
        title: '中文标题',
        textContent: '正文内容',
        icon: '',
        parentPageId: '',
        creatorId: 'user-1',
        labelIds: ['label-1'],
        createdAt: toUnixSeconds(createdAt),
      });
    });
  });

  describe('buildPageFilterBy', () => {
    it('scopes to workspace, spaces, labels and creator', () => {
      expect(
        buildPageFilterBy({
          workspaceId: 'ws-1',
          spaceIds: ['s1', 's2'],
          creatorId: 'u1',
          labelIds: ['l1', 'l2'],
        }),
      ).toBe(
        'workspaceId:=ws-1 && spaceId:=[s1,s2] && creatorId:=u1 && labelIds:=[l1,l2]',
      );
    });

    it('filters a single page id', () => {
      expect(
        buildPageFilterBy({
          workspaceId: 'ws-1',
          pageIds: ['p1'],
        }),
      ).toBe('workspaceId:=ws-1 && id:=p1');
    });
  });

  describe('search query helpers', () => {
    it('searches title only when requested', () => {
      expect(buildSearchQueryBy(true)).toBe('title');
      expect(buildSearchQueryBy(false)).toBe('title,textContent');
    });

    it('treats empty query with filters as browse mode', () => {
      expect(isBrowseByFilters({ query: '', labelIds: ['a'] } as any)).toBe(
        true,
      );
      expect(isBrowseByFilters({ query: '文档', labelIds: [] } as any)).toBe(
        false,
      );
    });
  });

  describe('highlights', () => {
    it('prefers textContent snippets and normalizes whitespace', () => {
      const highlight = extractHighlight({
        highlights: [
          {
            field: 'textContent',
            snippets: ['这是 <mark>中文</mark>\n片段', '另一段'],
            matched_tokens: [],
          },
        ],
        highlight: {},
        document: {} as any,
        text_match: 1,
      });

      expect(normalizeHighlight(highlight)).toBe(
        '这是 <mark>中文</mark> 片段 ... 另一段',
      );
    });
  });
});
