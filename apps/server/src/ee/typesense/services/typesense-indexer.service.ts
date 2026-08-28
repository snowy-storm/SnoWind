import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Client } from 'typesense';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  TYPESENSE_CLIENT,
  TYPESENSE_INDEX_BATCH_SIZE,
  TYPESENSE_PAGES_COLLECTION,
} from '../typesense.constants';
import { PageIndexSource, toPageDocument } from '../typesense.utils';
import { TypesenseCollectionService } from './typesense-collection.service';

@Injectable()
export class TypesenseIndexerService {
  private readonly logger = new Logger(TypesenseIndexerService.name);

  constructor(
    @Inject(TYPESENSE_CLIENT) private readonly client: Client | null,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly collectionService: TypesenseCollectionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  isEnabled(): boolean {
    return this.environmentService.getSearchDriver() === 'typesense';
  }

  async indexPages(pageIds: string[]): Promise<void> {
    if (!this.isEnabled() || !this.client || pageIds.length === 0) {
      return;
    }

    await this.collectionService.ensureCollection();
    const uniqueIds = [...new Set(pageIds)];

    const pages = await this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'spaceId',
        'workspaceId',
        'textContent',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ])
      .where('id', 'in', uniqueIds)
      .execute();

    const livePages = pages.filter((page) => page.deletedAt == null);
    const missingOrDeleted = uniqueIds.filter(
      (id) => !livePages.some((page) => page.id === id),
    );

    if (missingOrDeleted.length > 0) {
      await this.removePages(missingOrDeleted);
    }

    if (livePages.length === 0) {
      return;
    }

    const labels = await this.db
      .selectFrom('pageLabels')
      .select(['pageId', 'labelId'])
      .where(
        'pageId',
        'in',
        livePages.map((page) => page.id),
      )
      .execute();

    const labelsByPage = new Map<string, string[]>();
    for (const row of labels) {
      const current = labelsByPage.get(row.pageId) ?? [];
      current.push(row.labelId);
      labelsByPage.set(row.pageId, current);
    }

    const documents = livePages.map((page) =>
      toPageDocument({
        ...(page as PageIndexSource),
        labelIds: labelsByPage.get(page.id) ?? [],
      }),
    );

    await this.importDocuments(documents);
  }

  async removePages(pageIds: string[]): Promise<void> {
    if (!this.isEnabled() || !this.client || pageIds.length === 0) {
      return;
    }

    const uniqueIds = [...new Set(pageIds)];
    try {
      await this.client.collections(TYPESENSE_PAGES_COLLECTION).documents().delete({
        filter_by:
          uniqueIds.length === 1
            ? `id:=${uniqueIds[0]}`
            : `id:=[${uniqueIds.join(',')}]`,
        ignore_not_found: true,
      });
    } catch (err) {
      this.logger.warn(`Failed to remove pages from Typesense: ${err?.['message'] || err}`);
    }
  }

  async removeBySpace(spaceId: string): Promise<void> {
    await this.removeByFilter(`spaceId:=${spaceId}`);
  }

  async removeByWorkspace(workspaceId: string): Promise<void> {
    await this.removeByFilter(`workspaceId:=${workspaceId}`);
  }

  async reindexAllPages(): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    await this.collectionService.ensureCollection();

    let lastId: string | null = null;
    for (;;) {
      let query = this.db
        .selectFrom('pages')
        .select('id')
        .where('deletedAt', 'is', null)
        .orderBy('id', 'asc')
        .limit(TYPESENSE_INDEX_BATCH_SIZE);

      if (lastId) {
        query = query.where('id', '>', lastId);
      }

      const batch = await query.execute();
      if (batch.length === 0) {
        break;
      }

      await this.indexPages(batch.map((row) => row.id));
      lastId = batch[batch.length - 1].id;
    }
  }

  async reindexIfEmpty(): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    const ready = await this.collectionService.ensureCollection();
    if (!ready) {
      return;
    }

    try {
      const collection = await this.client
        .collections(TYPESENSE_PAGES_COLLECTION)
        .retrieve();
      if ((collection.num_documents ?? 0) > 0) {
        return;
      }
    } catch (err) {
      this.logger.warn(`Could not read Typesense collection stats: ${err?.['message'] || err}`);
      return;
    }

    this.logger.log('Typesense page index is empty; indexing existing pages');
    await this.reindexAllPages();
  }

  private async removeByFilter(filterBy: string): Promise<void> {
    if (!this.isEnabled() || !this.client) {
      return;
    }

    try {
      await this.client.collections(TYPESENSE_PAGES_COLLECTION).documents().delete({
        filter_by: filterBy,
        ignore_not_found: true,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to delete Typesense documents (${filterBy}): ${err?.['message'] || err}`,
      );
    }
  }

  private async importDocuments(
    documents: ReturnType<typeof toPageDocument>[],
  ): Promise<void> {
    if (!this.client || documents.length === 0) {
      return;
    }

    try {
      const result = await this.client
        .collections(TYPESENSE_PAGES_COLLECTION)
        .documents()
        .import(documents, { action: 'upsert' });

      const failed = (Array.isArray(result) ? result : []).filter(
        (item) => item && item.success === false,
      );
      if (failed.length > 0) {
        this.logger.warn(
          `Typesense import had ${failed.length} failed document(s)`,
        );
      }
    } catch (err) {
      this.logger.error(`Typesense import failed: ${err?.['message'] || err}`);
      throw err;
    }
  }
}
