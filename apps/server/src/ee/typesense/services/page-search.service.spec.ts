import { PageSearchService } from './page-search.service';

function createService(overrides?: {
  search?: jest.Mock;
  client?: any;
  spaceIds?: string[];
  accessibleIds?: string[];
  pages?: any[];
  share?: any;
}) {
  const search = overrides?.search ?? jest.fn();
  const client =
    overrides?.client === undefined
      ? {
          collections: jest.fn().mockReturnValue({
            documents: jest.fn().mockReturnValue({ search }),
          }),
        }
      : overrides.client;

  const db = {
    selectFrom: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(overrides?.pages ?? []),
    }),
  };

  const service = new PageSearchService(
    client,
    db as any,
    {
      withSpace: jest.fn(),
      getPageAndDescendantsExcludingRestricted: jest
        .fn()
        .mockResolvedValue([{ id: 'root' }, { id: 'page-2' }]),
    } as any,
    {
      findById: jest.fn().mockResolvedValue(overrides?.share ?? null),
    } as any,
    {
      getUserSpaceIds: jest
        .fn()
        .mockResolvedValue(overrides?.spaceIds ?? ['space-1']),
    } as any,
    {
      filterAccessiblePageIds: jest
        .fn()
        .mockImplementation(async ({ pageIds }) =>
          overrides?.accessibleIds ?? pageIds,
        ),
      hasRestrictedAncestor: jest.fn().mockResolvedValue(false),
    } as any,
    {
      ensureCollection: jest.fn().mockResolvedValue(true),
    } as any,
    {
      getTypesenseLocale: jest.fn().mockReturnValue('zh'),
    } as any,
  );

  return { service, search, client };
}

describe('PageSearchService', () => {
  it('returns no items for an empty query without filters', async () => {
    const { service, search } = createService();

    await expect(
      service.searchPage(
        { query: '  ' } as any,
        { userId: 'user-1', workspaceId: 'ws-1' },
      ),
    ).resolves.toEqual({ items: [] });

    expect(search).not.toHaveBeenCalled();
  });

  it('searches Typesense with Chinese locale settings', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: [
        {
          document: { id: 'page-1' },
          text_match: 42,
          highlights: [
            { field: 'textContent', snippet: '匹配 <mark>文档</mark>' },
          ],
        },
      ],
    });
    const pages = [
      {
        id: 'page-1',
        slugId: 'slug-1',
        title: '产品文档',
        icon: null,
        parentPageId: null,
        creatorId: 'user-1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        space: { id: 'space-1', name: '知识库', slug: 'kb' },
      },
    ];
    const { service } = createService({ search, pages });

    const result = await service.searchPage(
      { query: '文档' } as any,
      { userId: 'user-1', workspaceId: 'ws-1' },
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        q: '文档',
        query_by: 'title,textContent',
        filter_by: 'workspaceId:=ws-1 && spaceId:=space-1',
        num_typos: 0,
        highlight_start_tag: '<mark>',
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'page-1',
      title: '产品文档',
      highlight: '匹配 <mark>文档</mark>',
      rank: 42,
      space: { name: '知识库' },
    });
  });

  it('drops pages the user cannot access', async () => {
    const search = jest.fn().mockResolvedValue({
      hits: [
        { document: { id: 'page-1' }, text_match: 1, highlights: [] },
        { document: { id: 'page-2' }, text_match: 2, highlights: [] },
      ],
    });
    const { service } = createService({
      search,
      accessibleIds: ['page-2'],
      pages: [
        {
          id: 'page-2',
          slugId: 'slug-2',
          title: '可见页面',
          icon: null,
          parentPageId: null,
          creatorId: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          space: { id: 'space-1', name: 'Space', slug: 'space' },
        },
      ],
    });

    const result = await service.searchPage(
      { query: '页面' } as any,
      { userId: 'user-1', workspaceId: 'ws-1' },
    );

    expect(result.items.map((item) => item.id)).toEqual(['page-2']);
  });

  it('scopes shared search to descendant pages', async () => {
    const search = jest.fn().mockResolvedValue({ hits: [] });
    const { service } = createService({
      search,
      share: {
        id: 'share-1',
        workspaceId: 'ws-1',
        pageId: 'root',
        includeSubPages: true,
      },
    });

    await service.searchPage(
      { query: '共享', shareId: 'share-1' } as any,
      { workspaceId: 'ws-1' },
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        filter_by: 'workspaceId:=ws-1 && id:=[root,page-2]',
      }),
    );
  });
});
