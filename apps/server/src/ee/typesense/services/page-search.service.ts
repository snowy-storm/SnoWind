import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Client } from 'typesense';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { SearchDTO } from '../../../core/search/dto/search.dto';
import { SearchResponseDto } from '../../../core/search/dto/search-response.dto';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@snowind/db/repos/space/space-member.repo';
import { ShareRepo } from '@snowind/db/repos/share/share.repo';
import { PagePermissionRepo } from '@snowind/db/repos/page/page-permission.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  TYPESENSE_CLIENT,
  TYPESENSE_PAGES_COLLECTION,
} from '../typesense.constants';
import {
  PageSearchDocument,
  buildPageFilterBy,
  buildSearchQueryBy,
  extractHighlight,
  isBrowseByFilters,
  isCjkLocale,
  normalizeHighlight,
} from '../typesense.utils';
import { TypesenseCollectionService } from './typesense-collection.service';

@Injectable()
export class PageSearchService {
  private readonly logger = new Logger(PageSearchService.name);

  constructor(
    @Inject(TYPESENSE_CLIENT) private readonly client: Client | null,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly shareRepo: ShareRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly collectionService: TypesenseCollectionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async searchPage(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
    },
  ): Promise<{ items: SearchResponseDto[] }> {
    const query = searchParams.query?.trim() ?? '';
    const browseByFilters = isBrowseByFilters(searchParams);

    if (query.length < 1 && !browseByFilters) {
      return { items: [] };
    }

    if (!this.client) {
      this.logger.warn('Typesense client is not configured');
      return { items: [] };
    }

    await this.collectionService.ensureCollection();

    const scope = await this.resolveSearchScope(searchParams, opts);
    if (!scope) {
      return { items: [] };
    }

    const locale = this.environmentService.getTypesenseLocale();
    const limit = searchParams.limit || 25;
    const offset = searchParams.offset || 0;
    const page = Math.floor(offset / limit) + 1;

    const searchResult = await this.client
      .collections<PageSearchDocument>(TYPESENSE_PAGES_COLLECTION)
      .documents()
      .search({
        q: browseByFilters ? '*' : query,
        query_by: buildSearchQueryBy(searchParams.titleOnly),
        filter_by: buildPageFilterBy({
          workspaceId: opts.workspaceId,
          spaceIds: scope.spaceIds,
          pageIds: scope.pageIds,
          creatorId: searchParams.creatorId,
          labelIds: searchParams.labelIds,
        }),
        per_page: limit,
        page,
        highlight_fields: 'textContent,title',
        highlight_start_tag: '<mark>',
        highlight_end_tag: '</mark>',
        highlight_affix_num_tokens: 8,
        num_typos: isCjkLocale(locale) ? 0 : 2,
        prefix: true,
        sort_by: browseByFilters ? 'updatedAt:desc' : '_text_match:desc',
      });

    const hits = searchResult.hits ?? [];
    if (hits.length === 0) {
      return { items: [] };
    }

    const highlightById = new Map<string, string>();
    const rankById = new Map<string, number>();
    const orderedIds: string[] = [];

    for (const hit of hits) {
      const id = hit.document?.id;
      if (!id) {
        continue;
      }
      orderedIds.push(id);
      rankById.set(id, hit.text_match ?? 0);
      highlightById.set(id, normalizeHighlight(extractHighlight(hit)));
    }

    let accessibleIds = orderedIds;
    if (opts.userId && orderedIds.length > 0) {
      accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: orderedIds,
        userId: opts.userId,
        spaceId: searchParams.spaceId,
      });
    }

    const accessibleSet = new Set(accessibleIds);
    const pageIds = orderedIds.filter((id) => accessibleSet.has(id));
    if (pageIds.length === 0) {
      return { items: [] };
    }

    const pages = await this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'createdAt',
        'updatedAt',
      ])
      .select((eb) => this.pageRepo.withSpace(eb))
      .where('id', 'in', pageIds)
      .where('deletedAt', 'is', null)
      .execute();

    const pagesById = new Map(pages.map((page) => [page.id, page]));

    const items = pageIds
      .map((id) => {
        const page = pagesById.get(id);
        if (!page) {
          return null;
        }
        return {
          id: page.id,
          slugId: page.slugId,
          title: page.title,
          icon: page.icon,
          parentPageId: page.parentPageId,
          creatorId: page.creatorId,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          rank: rankById.get(id) ?? 0,
          highlight: searchParams.titleOnly ? '' : (highlightById.get(id) ?? ''),
          space: (page as { space?: SearchResponseDto['space'] }).space,
        } as SearchResponseDto;
      })
      .filter(Boolean) as SearchResponseDto[];

    return { items };
  }

  private async resolveSearchScope(
    searchParams: SearchDTO,
    opts: { userId?: string; workspaceId: string },
  ): Promise<{ spaceIds?: string[]; pageIds?: string[] } | null> {
    if (searchParams.spaceId && opts.userId) {
      return { spaceIds: [searchParams.spaceId] };
    }

    if (opts.userId && !searchParams.spaceId) {
      const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(opts.userId);
      if (!spaceIds.length) {
        return null;
      }
      return { spaceIds };
    }

    if (searchParams.shareId && !searchParams.spaceId && !opts.userId) {
      const share = await this.shareRepo.findById(searchParams.shareId);
      if (!share || share.workspaceId !== opts.workspaceId) {
        return null;
      }

      const isRestricted = await this.pagePermissionRepo.hasRestrictedAncestor(
        share.pageId,
      );
      if (isRestricted) {
        return null;
      }

      const pageIdsToSearch: string[] = [];
      if (share.includeSubPages) {
        const pageList =
          await this.pageRepo.getPageAndDescendantsExcludingRestricted(
            share.pageId,
            { includeContent: false },
          );
        pageIdsToSearch.push(...pageList.map((page) => page.id));
      } else {
        pageIdsToSearch.push(share.pageId);
      }

      if (pageIdsToSearch.length === 0) {
        return null;
      }

      return { pageIds: pageIdsToSearch };
    }

    return null;
  }
}
