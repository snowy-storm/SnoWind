import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { FileTask, InsertablePage } from '@snowind/db/types/entity.types';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v7 as uuid7 } from 'uuid';
import { Readable } from 'stream';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Inject } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { ImportService } from './import.service';
import { generateSlugId } from '../../../common/helpers';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';
import { jsonToText } from '../../../collaboration/collaboration.util';
import { getProsemirrorContent } from '../../../common/helpers/prosemirror/utils';
import { executeTx } from '@snowind/db/utils';
import { EventName } from '../../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../audit/audit.service';
import {
  isSnowindArchiveManifest,
  SnowindArchiveAttachmentMeta,
  SnowindArchiveBaseData,
  SnowindArchiveManifest,
  SnowindArchivePage,
  SNOWIND_ARCHIVE_FORMAT_VERSION,
} from '../../../common/helpers/types/snowind-archive.types';
import {
  ArchivePageMapEntry,
  remapArchiveContent,
  remapBaseCells,
  remapCoverPhoto,
} from '../utils/archive-remap.utils';
import { BacklinkRepo } from '@snowind/db/repos/backlink/backlink.repo';
import { TransclusionService } from '../../../core/page/transclusion/transclusion.service';
import { jsonToNode } from '../../../collaboration/collaboration.util';
import { Node as PMNode } from '@tiptap/pm/model';

@Injectable()
export class SnowindArchiveImportService {
  private readonly logger = new Logger(SnowindArchiveImportService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly importService: ImportService,
    private readonly backlinkRepo: BacklinkRepo,
    private readonly transclusionService: TransclusionService,
    @InjectKysely() private readonly db: KyselyDB,
    private eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async tryReadManifest(
    extractDir: string,
  ): Promise<SnowindArchiveManifest | null> {
    const manifestPath = path.join(extractDir, 'manifest.json');
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!isSnowindArchiveManifest(parsed)) return null;
      if (parsed.formatVersion > SNOWIND_ARCHIVE_FORMAT_VERSION) {
        throw new Error(
          `Unsupported archive formatVersion ${parsed.formatVersion}`,
        );
      }
      return parsed;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return null;
      if (err instanceof SyntaxError) return null;
      throw err;
    }
  }

  async processArchiveImport(opts: {
    extractDir: string;
    fileTask: FileTask;
    manifest: SnowindArchiveManifest;
  }): Promise<void> {
    const { extractDir, fileTask, manifest } = opts;

    const pageMap = new Map<string, ArchivePageMapEntry>();
    for (const oldPageId of manifest.pageIds) {
      pageMap.set(oldPageId, {
        newPageId: uuid7(),
        newSlugId: generateSlugId(),
      });
    }

    const attachmentMap = new Map<
      string,
      { newAttachmentId: string; newFileName: string; newPageId: string | null }
    >();

    const pagesByOldId = new Map<string, SnowindArchivePage>();
    for (const oldPageId of manifest.pageIds) {
      const pagePath = path.join(extractDir, 'pages', `${oldPageId}.json`);
      const raw = await fs.readFile(pagePath, 'utf-8');
      const page = JSON.parse(raw) as SnowindArchivePage;
      pagesByOldId.set(oldPageId, page);
    }

    // Pre-assign attachment IDs from meta (before rewriting content)
    for (const oldAttId of manifest.attachmentIds) {
      const metaPath = path.join(
        extractDir,
        'attachments',
        oldAttId,
        'meta.json',
      );
      let meta: SnowindArchiveAttachmentMeta;
      try {
        meta = JSON.parse(
          await fs.readFile(metaPath, 'utf-8'),
        ) as SnowindArchiveAttachmentMeta;
      } catch (err) {
        this.logger.warn(`Missing attachment meta for ${oldAttId}, skipping`);
        continue;
      }

      const newPageId = meta.pageId
        ? (pageMap.get(meta.pageId)?.newPageId ?? null)
        : null;

      attachmentMap.set(oldAttId, {
        newAttachmentId: uuid7(),
        newFileName: meta.fileName,
        newPageId,
      });
    }

    const validPageIds = new Set<string>();
    const pageTitles = new Map<string, string>();
    const insertablePages: InsertablePage[] = [];
    const allBacklinks: Array<{
      sourcePageId: string;
      targetPageId: string;
      workspaceId: string;
    }> = [];

    for (const oldPageId of manifest.pageIds) {
      const page = pagesByOldId.get(oldPageId);
      const mapped = pageMap.get(oldPageId);
      if (!page || !mapped) continue;

      const remappedContent = remapArchiveContent(
        page.content,
        pageMap,
        attachmentMap,
      );
      const prosemirrorJson = getProsemirrorContent(remappedContent);
      const coverPhoto = remapCoverPhoto(page.coverPhoto, attachmentMap);

      const parentPageId = page.parentPageId
        ? (pageMap.get(page.parentPageId)?.newPageId ?? null)
        : null;

      insertablePages.push({
        id: mapped.newPageId,
        slugId: mapped.newSlugId,
        title: page.title,
        icon: page.icon,
        coverPhoto,
        content: prosemirrorJson,
        textContent: jsonToText(prosemirrorJson),
        ydoc: await this.importService.createYdoc(prosemirrorJson),
        position: page.position,
        spaceId: fileTask.spaceId,
        workspaceId: fileTask.workspaceId,
        creatorId: fileTask.creatorId,
        lastUpdatedById: fileTask.creatorId,
        parentPageId,
        isBase: Boolean(page.isBase),
        drawingType: page.drawingType,
        fileType: page.fileType,
      });

      validPageIds.add(mapped.newPageId);
      pageTitles.set(mapped.newPageId, page.title || 'untitled');

      // Collect backlinks from remapped mentions
      try {
        const doc = jsonToNode(prosemirrorJson);
        doc?.descendants((node: PMNode) => {
          if (
            node.type.name === 'mention' &&
            node.attrs.entityType === 'page' &&
            node.attrs.entityId
          ) {
            const targetId = node.attrs.entityId as string;
            if (validPageIds.has(targetId) || pageMapHasNewId(pageMap, targetId)) {
              allBacklinks.push({
                sourcePageId: mapped.newPageId,
                targetPageId: targetId,
                workspaceId: fileTask.workspaceId,
              });
            }
          }
        });
      } catch {
        // ignore parse errors for backlinks
      }
    }

    await executeTx(this.db, async (trx) => {
      if (insertablePages.length > 0) {
        // Insert in batches to avoid oversized statements
        const BATCH = 50;
        for (let i = 0; i < insertablePages.length; i += BATCH) {
          await trx
            .insertInto('pages')
            .values(insertablePages.slice(i, i + BATCH))
            .execute();
        }
      }

      // Upload attachments
      for (const [oldAttId, mapped] of attachmentMap) {
        const metaPath = path.join(
          extractDir,
          'attachments',
          oldAttId,
          'meta.json',
        );
        let meta: SnowindArchiveAttachmentMeta;
        try {
          meta = JSON.parse(
            await fs.readFile(metaPath, 'utf-8'),
          ) as SnowindArchiveAttachmentMeta;
        } catch {
          continue;
        }

        const fileAbs = path.join(
          extractDir,
          'attachments',
          oldAttId,
          meta.fileName,
        );
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(fileAbs);
        } catch (err) {
          this.logger.warn(
            `Failed to read attachment file ${oldAttId}/${meta.fileName}`,
          );
          continue;
        }

        const storageFilePath = `${getAttachmentFolderPath(
          AttachmentType.File,
          fileTask.workspaceId,
        )}/${mapped.newAttachmentId}/${mapped.newFileName}`;

        try {
          await this.storageService.uploadStream(
            storageFilePath,
            Readable.from(buffer),
            { recreateClient: true },
          );

          await trx
            .insertInto('attachments')
            .values({
              id: mapped.newAttachmentId,
              filePath: storageFilePath,
              fileName: mapped.newFileName,
              fileSize: meta.fileSize ?? buffer.length,
              mimeType: meta.mimeType,
              type: meta.type || 'file',
              fileExt: meta.fileExt,
              creatorId: fileTask.creatorId,
              workspaceId: fileTask.workspaceId,
              pageId: mapped.newPageId,
              spaceId: fileTask.spaceId,
            })
            .execute();
        } catch (err) {
          this.logger.error(
            `Failed to import attachment ${oldAttId}`,
            err,
          );
        }
      }

      // Restore base data
      for (const oldPageId of manifest.pageIds) {
        const page = pagesByOldId.get(oldPageId);
        const mapped = pageMap.get(oldPageId);
        if (!page?.isBase || !mapped) continue;

        const basePath = path.join(extractDir, 'bases', `${oldPageId}.json`);
        let baseData: SnowindArchiveBaseData;
        try {
          baseData = JSON.parse(
            await fs.readFile(basePath, 'utf-8'),
          ) as SnowindArchiveBaseData;
        } catch {
          this.logger.warn(`Missing base data for page ${oldPageId}`);
          continue;
        }

        for (const prop of baseData.properties ?? []) {
          await trx
            .insertInto('baseProperties')
            .values({
              id: prop.id,
              pageId: mapped.newPageId,
              name: prop.name,
              type: prop.type,
              position: prop.position,
              typeOptions: prop.typeOptions as any,
              isPrimary: prop.isPrimary,
              schemaVersion: prop.schemaVersion ?? 1,
              workspaceId: fileTask.workspaceId,
            })
            .execute();
        }

        const remappedRows = (baseData.rows ?? []).map((row) => ({
          pageId: mapped.newPageId,
          workspaceId: fileTask.workspaceId,
          creatorId: fileTask.creatorId,
          lastUpdatedById: fileTask.creatorId,
          position: row.position,
          cells: remapBaseCells(
            row.cells ?? {},
            baseData.properties ?? [],
            pageMap,
            attachmentMap,
          ) as any,
        }));

        if (remappedRows.length > 0) {
          const BATCH = 100;
          for (let i = 0; i < remappedRows.length; i += BATCH) {
            await trx
              .insertInto('baseRows')
              .values(remappedRows.slice(i, i + BATCH))
              .execute();
          }
        }

        for (const view of baseData.views ?? []) {
          await trx
            .insertInto('baseViews')
            .values({
              pageId: mapped.newPageId,
              workspaceId: fileTask.workspaceId,
              creatorId: fileTask.creatorId,
              name: view.name,
              type: view.type,
              position: view.position,
              config: view.config as any,
              isDefault: view.isDefault,
              isPrivate: view.isPrivate,
            })
            .execute();
        }
      }

      const filteredBacklinks = allBacklinks.filter(
        ({ sourcePageId, targetPageId }) =>
          validPageIds.has(sourcePageId) && validPageIds.has(targetPageId),
      );

      if (filteredBacklinks.length > 0) {
        const BACKLINK_BATCH = 100;
        for (let i = 0; i < filteredBacklinks.length; i += BACKLINK_BATCH) {
          await this.backlinkRepo.insertBacklink(
            filteredBacklinks.slice(i, i + BACKLINK_BATCH),
            trx,
          );
        }
      }
    });

    // Transclusions (outside main tx is ok; tables reference pages already committed)
    try {
      await this.transclusionService.insertTransclusionsForPages(
        insertablePages.map((p) => ({
          id: p.id!,
          workspaceId: p.workspaceId!,
          content: p.content,
        })),
      );
      await this.transclusionService.insertReferencesForPages(
        insertablePages.map((p) => ({
          id: p.id!,
          workspaceId: p.workspaceId!,
          content: p.content,
        })),
      );
    } catch (err) {
      this.logger.error('Failed to insert transclusions for archive import', err);
    }

    if (validPageIds.size > 0) {
      this.eventEmitter.emit(EventName.PAGE_CREATED, {
        pageIds: Array.from(validPageIds),
        workspaceId: fileTask.workspaceId,
      });

      this.auditService.logBatchWithContext(
        Array.from(validPageIds).map((pageId) => ({
          event: AuditEvent.PAGE_CREATED,
          resourceType: AuditResource.PAGE,
          resourceId: pageId,
          spaceId: fileTask.spaceId,
          metadata: {
            source: 'snowind-archive',
            fileTaskId: fileTask.id,
            title: pageTitles.get(pageId),
          },
        })),
        {
          workspaceId: fileTask.workspaceId,
          actorId: fileTask.creatorId,
          actorType: 'user',
        },
      );
    }

    this.logger.log(
      `Successfully imported snowind-archive: ${validPageIds.size} pages, ${attachmentMap.size} attachments`,
    );
  }
}

function pageMapHasNewId(
  pageMap: Map<string, ArchivePageMapEntry>,
  newPageId: string,
): boolean {
  for (const entry of pageMap.values()) {
    if (entry.newPageId === newPageId) return true;
  }
  return false;
}
