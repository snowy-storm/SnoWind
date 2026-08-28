import { CollectionFieldSchema } from 'typesense/lib/Typesense/Collection';
import { SearchResponseHit } from 'typesense/lib/Typesense/Documents';
import { SearchDTO } from '../../core/search/dto/search.dto';
import {
  CJK_LOCALES,
  TYPESENSE_PAGES_COLLECTION,
  TYPESENSE_TEXT_LIMIT,
} from './typesense.constants';

export interface TypesenseNodeConfig {
  host: string;
  port: number;
  protocol: string;
}

export interface PageSearchDocument {
  id: string;
  slugId: string;
  title: string;
  textContent: string;
  icon: string;
  parentPageId: string;
  creatorId: string;
  spaceId: string;
  workspaceId: string;
  labelIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PageIndexSource {
  id: string;
  slugId: string;
  title?: string | null;
  textContent?: string | null;
  icon?: string | null;
  parentPageId?: string | null;
  creatorId?: string | null;
  spaceId: string;
  workspaceId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  labelIds?: string[];
}

export function parseTypesenseUrl(urlString: string): TypesenseNodeConfig {
  const url = new URL(urlString);
  const protocol = url.protocol.replace(':', '') || 'http';
  const port = url.port
    ? Number.parseInt(url.port, 10)
    : protocol === 'https'
      ? 443
      : 80;

  return {
    host: url.hostname,
    port,
    protocol,
  };
}

export function isCjkLocale(locale: string): boolean {
  return (CJK_LOCALES as readonly string[]).includes(locale);
}

export function buildPageCollectionSchema(locale: string): {
  name: string;
  metadata: { locale: string };
  fields: CollectionFieldSchema[];
} {
  const textField = {
    locale,
    type: 'string' as const,
  };

  return {
    name: TYPESENSE_PAGES_COLLECTION,
    metadata: { locale },
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slugId', type: 'string', index: false },
      { name: 'title', ...textField },
      { name: 'textContent', ...textField, optional: true },
      { name: 'icon', type: 'string', optional: true, index: false },
      {
        name: 'parentPageId',
        type: 'string',
        optional: true,
        index: false,
      },
      { name: 'creatorId', type: 'string', optional: true, facet: true },
      { name: 'spaceId', type: 'string', facet: true },
      { name: 'workspaceId', type: 'string', facet: true },
      { name: 'labelIds', type: 'string[]', facet: true, optional: true },
      { name: 'createdAt', type: 'int64' },
      { name: 'updatedAt', type: 'int64' },
    ],
  };
}

export function toUnixSeconds(value: Date | string | number): number {
  if (typeof value === 'number') {
    return value > 1e12 ? Math.floor(value / 1000) : value;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Math.floor(date.getTime() / 1000);
}

export function toPageDocument(page: PageIndexSource): PageSearchDocument {
  const textContent = (page.textContent ?? '').slice(0, TYPESENSE_TEXT_LIMIT);

  return {
    id: page.id,
    slugId: page.slugId,
    title: page.title ?? '',
    textContent,
    icon: page.icon ?? '',
    parentPageId: page.parentPageId ?? '',
    creatorId: page.creatorId ?? '',
    spaceId: page.spaceId,
    workspaceId: page.workspaceId,
    labelIds: page.labelIds ?? [],
    createdAt: toUnixSeconds(page.createdAt),
    updatedAt: toUnixSeconds(page.updatedAt),
  };
}

export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function idListFilter(field: string, ids: string[]): string {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return '';
  }
  if (unique.length === 1) {
    return `${field}:=${escapeFilterValue(unique[0])}`;
  }
  return `${field}:=[${unique.map(escapeFilterValue).join(',')}]`;
}

export function buildPageFilterBy(opts: {
  workspaceId: string;
  spaceIds?: string[];
  pageIds?: string[];
  creatorId?: string;
  labelIds?: string[];
}): string {
  const filters = [`workspaceId:=${escapeFilterValue(opts.workspaceId)}`];

  const spaceFilter = opts.spaceIds ? idListFilter('spaceId', opts.spaceIds) : '';
  if (spaceFilter) {
    filters.push(spaceFilter);
  }

  const pageFilter = opts.pageIds ? idListFilter('id', opts.pageIds) : '';
  if (pageFilter) {
    filters.push(pageFilter);
  }

  if (opts.creatorId) {
    filters.push(`creatorId:=${escapeFilterValue(opts.creatorId)}`);
  }

  if (opts.labelIds?.length) {
    // OR: page has any of the selected labels
    filters.push(idListFilter('labelIds', opts.labelIds));
  }

  return filters.join(' && ');
}

export function buildSearchQueryBy(titleOnly?: boolean): string {
  return titleOnly ? 'title' : 'title,textContent';
}

export function isBrowseByFilters(searchParams: SearchDTO): boolean {
  const query = searchParams.query?.trim() ?? '';
  const labelIds = [...new Set(searchParams.labelIds ?? [])];
  return (
    query.length < 1 && (labelIds.length > 0 || Boolean(searchParams.creatorId))
  );
}

export function extractHighlight(
  hit: SearchResponseHit<PageSearchDocument> | { highlights?: any[]; highlight?: any },
): string {
  const highlights = hit.highlights ?? [];
  const content = highlights.find((item) => item.field === 'textContent');
  if (content?.snippets?.length) {
    return content.snippets.join(' ... ');
  }
  if (content?.snippet) {
    return content.snippet;
  }

  const title = highlights.find((item) => item.field === 'title');
  if (title?.snippet) {
    return title.snippet;
  }

  const highlight = hit.highlight as
    | { textContent?: { snippet?: string; snippets?: string[] }; title?: { snippet?: string } }
    | undefined;
  if (highlight?.textContent?.snippets?.length) {
    return highlight.textContent.snippets.join(' ... ');
  }
  if (highlight?.textContent?.snippet) {
    return highlight.textContent.snippet;
  }
  return highlight?.title?.snippet ?? '';
}

export function normalizeHighlight(highlight: string): string {
  return highlight.replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
}
