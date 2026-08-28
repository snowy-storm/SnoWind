import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { jsonToText } from '../../collaboration/collaboration.util';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { FileTask, InsertablePage } from '@snowind/db/types/entity.types';
import { generateSlugId } from '../../common/helpers';
import { v7 } from 'uuid';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { formatImportHtml } from '../../integrations/import/utils/import-formatter';
import { buildAttachmentCandidates } from '../../integrations/import/utils/import.utils';
import { executeTx } from '@snowind/db/utils';
import { BacklinkRepo } from '@snowind/db/repos/backlink/backlink.repo';
import { ImportAttachmentService } from '../../integrations/import/services/import-attachment.service';
import { ImportService } from '../../integrations/import/services/import.service';
import { PageService } from '../../core/page/services/page.service';
import { ImportPageNode } from '../../integrations/import/dto/file-task-dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  extractConfluencePage,
  findConfluenceIndexHtml,
  listConfluencePageFiles,
  parseConfluenceIndexParentMap,
  resolveConfluenceHref,
} from './confluence-html';

@Injectable()
export class ConfluenceImportService {
  private readonly logger = new Logger(ConfluenceImportService.name);

  constructor(
    private readonly importService: ImportService,
    private readonly pageService: PageService,
    private readonly backlinkRepo: BacklinkRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly importAttachmentService: ImportAttachmentService,
    private eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async processConfluenceImport(opts: {
    extractDir: string;
    fileTask: FileTask;
  }): Promise<void> {
    const { extractDir, fileTask } = opts;
    const pageFiles = await listConfluencePageFiles(extractDir);

    if (pageFiles.length < 1) {
      throw new Error(
        'No Confluence pages found in the export. Export the space as HTML and try again.',
      );
    }

    const attachmentCandidates = await buildAttachmentCandidates(extractDir);
    const space = await this.db
      .selectFrom('spaces')
      .select(['slug'])
      .where('id', '=', fileTask.spaceId)
      .executeTakeFirst();

    const pagesMap = new Map<string, ImportPageNode>();

    for (const { absPath, relPath } of pageFiles) {
      const html = await fs.readFile(absPath, 'utf-8');
      const extracted = extractConfluencePage(html, relPath);
      pagesMap.set(relPath, {
        id: v7(),
        slugId: generateSlugId(),
        name: extracted.title,
        content: extracted.contentHtml,
        parentPageId: null,
        fileExtension: '.html',
        filePath: relPath,
        pageAttachments: extracted.attachments,
      });
    }

    await this.applyHierarchy(extractDir, pagesMap);

    const siblingsMap = new Map<string | null, ImportPageNode[]>();
    pagesMap.forEach((page) => {
      const group = siblingsMap.get(page.parentPageId) ?? [];
      group.push(page);
      siblingsMap.set(page.parentPageId, group);
    });

    const sortSiblings = (siblings: ImportPageNode[]) => {
      siblings.sort((a, b) => a.name.localeCompare(b.name));
    };

    const rootSibs = siblingsMap.get(null);
    if (rootSibs?.length) {
      sortSiblings(rootSibs);
      const nextPosition = await this.pageService.nextPagePosition(
        fileTask.spaceId,
      );
      let prevPos: string | null = null;
      rootSibs.forEach((page, idx) => {
        if (idx === 0) {
          page.position = nextPosition;
        } else {
          page.position = generateJitteredKeyBetween(prevPos, null);
        }
        prevPos = page.position;
      });
    }

    siblingsMap.forEach((sibs, parentId) => {
      if (parentId === null) return;
      sortSiblings(sibs);
      let prevPos: string | null = null;
      for (const page of sibs) {
        page.position = generateJitteredKeyBetween(prevPos, null);
        prevPos = page.position;
      }
    });

    const filePathToPageMetaMap = new Map<
      string,
      { id: string; title: string; slugId: string }
    >();
    pagesMap.forEach((page) => {
      filePathToPageMetaMap.set(page.filePath, {
        id: page.id,
        title: page.name,
        slugId: page.slugId,
      });
    });

    const pagesByLevel = new Map<number, Array<[string, ImportPageNode]>>();
    const pageLevel = new Map<string, number>();
    const queue: Array<{ filePath: string; level: number }> = [];

    for (const [filePath, page] of pagesMap.entries()) {
      if (!page.parentPageId) {
        queue.push({ filePath, level: 0 });
        pageLevel.set(filePath, 0);
      }
    }

    while (queue.length > 0) {
      const { filePath, level } = queue.shift()!;
      const currentPage = pagesMap.get(filePath)!;
      for (const [childFilePath, childPage] of pagesMap.entries()) {
        if (
          childPage.parentPageId === currentPage.id &&
          !pageLevel.has(childFilePath)
        ) {
          pageLevel.set(childFilePath, level + 1);
          queue.push({ filePath: childFilePath, level: level + 1 });
        }
      }
    }

    for (const [filePath, page] of pagesMap.entries()) {
      const level = pageLevel.get(filePath) || 0;
      if (!pagesByLevel.has(level)) {
        pagesByLevel.set(level, []);
      }
      pagesByLevel.get(level)!.push([filePath, page]);
    }

    const allBacklinks: any[] = [];
    const validPageIds = new Set<string>();
    const pageTitles = new Map<string, string>();
    let totalPagesProcessed = 0;
    const sortedLevels = Array.from(pagesByLevel.keys()).sort((a, b) => a - b);

    try {
      await executeTx(this.db, async (trx) => {
        for (const level of sortedLevels) {
          const levelPages = pagesByLevel.get(level)!;

          for (const [, page] of levelPages) {
            const htmlContent =
              await this.importAttachmentService.processAttachments({
                html: page.content,
                pageRelativePath: page.filePath,
                extractDir,
                pageId: page.id,
                fileTask,
                attachmentCandidates,
                pageAttachments: page.pageAttachments ?? [],
                isConfluenceImport: true,
              });

            const { html, backlinks, pageIcon } = await formatImportHtml({
              html: htmlContent,
              currentFilePath: page.filePath,
              filePathToPageMetaMap,
              creatorId: fileTask.creatorId,
              sourcePageId: page.id,
              workspaceId: fileTask.workspaceId,
              spaceSlug: space?.slug,
            });

            const pmState = getProsemirrorContent(
              await this.importService.processHTML(html),
            );

            const { title, prosemirrorJson } =
              this.importService.extractTitleAndRemoveHeading(pmState);

            const insertablePage: InsertablePage = {
              id: page.id,
              slugId: page.slugId,
              title: title || page.name,
              icon: page.icon || pageIcon || null,
              content: prosemirrorJson,
              textContent: jsonToText(prosemirrorJson),
              ydoc: await this.importService.createYdoc(prosemirrorJson),
              position: page.position!,
              spaceId: fileTask.spaceId,
              workspaceId: fileTask.workspaceId,
              creatorId: fileTask.creatorId,
              lastUpdatedById: fileTask.creatorId,
              parentPageId: page.parentPageId,
            };

            await trx.insertInto('pages').values(insertablePage).execute();

            validPageIds.add(insertablePage.id);
            pageTitles.set(insertablePage.id, insertablePage.title);
            allBacklinks.push(...backlinks);
            totalPagesProcessed++;

            if (totalPagesProcessed % 50 === 0) {
              this.logger.debug(
                `Processed ${totalPagesProcessed} Confluence pages...`,
              );
            }
          }
        }

        const filteredBacklinks = allBacklinks.filter(
          ({ sourcePageId, targetPageId }) =>
            validPageIds.has(sourcePageId) && validPageIds.has(targetPageId),
        );

        if (filteredBacklinks.length > 0) {
          const BACKLINK_BATCH_SIZE = 100;
          for (
            let i = 0;
            i < filteredBacklinks.length;
            i += BACKLINK_BATCH_SIZE
          ) {
            const backlinkChunk = filteredBacklinks.slice(
              i,
              Math.min(i + BACKLINK_BATCH_SIZE, filteredBacklinks.length),
            );
            await this.backlinkRepo.insertBacklink(backlinkChunk, trx);
          }
        }

        if (validPageIds.size > 0) {
          this.eventEmitter.emit(EventName.PAGE_CREATED, {
            pageIds: Array.from(validPageIds),
            workspaceId: fileTask.workspaceId,
          });
        }

        this.logger.log(
          `Successfully imported ${totalPagesProcessed} Confluence pages with ${filteredBacklinks.length} backlinks`,
        );
      });

      if (validPageIds.size > 0) {
        const auditPayloads = Array.from(validPageIds).map((pageId) => ({
          event: AuditEvent.PAGE_CREATED,
          resourceType: AuditResource.PAGE,
          resourceId: pageId,
          spaceId: fileTask.spaceId,
          metadata: {
            source: fileTask.source,
            fileTaskId: fileTask.id,
            title: pageTitles.get(pageId),
          },
        }));

        this.auditService.logBatchWithContext(auditPayloads, {
          workspaceId: fileTask.workspaceId,
          actorId: fileTask.creatorId,
          actorType: 'user',
        });
      }
    } catch (error) {
      this.logger.error('Failed to import Confluence files:', error);
      throw new Error(`Confluence import failed: ${error?.['message']}`);
    }
  }

  private async applyHierarchy(
    extractDir: string,
    pagesMap: Map<string, ImportPageNode>,
  ): Promise<void> {
    const knownPaths = [...pagesMap.keys()];
    const assigned = new Set<string>();

    const index = await findConfluenceIndexHtml(extractDir);
    if (index) {
      const indexHtml = await fs.readFile(index.absPath, 'utf-8');
      const parentByHref = parseConfluenceIndexParentMap(indexHtml);
      const indexDir = index.dirRel;

      for (const [href, parentHref] of parentByHref.entries()) {
        const childPath = resolveConfluenceHref(href, indexDir, knownPaths);
        if (!childPath) {
          continue;
        }
        const page = pagesMap.get(childPath);
        if (!page) {
          continue;
        }
        if (!parentHref) {
          page.parentPageId = null;
          assigned.add(childPath);
          continue;
        }
        const parentPath = resolveConfluenceHref(
          parentHref,
          indexDir,
          knownPaths,
        );
        if (parentPath && parentPath !== childPath) {
          page.parentPageId = pagesMap.get(parentPath)?.id ?? null;
          assigned.add(childPath);
        } else {
          page.parentPageId = null;
          assigned.add(childPath);
        }
      }
    }

    for (const [relPath, page] of pagesMap.entries()) {
      if (assigned.has(relPath)) {
        continue;
      }
      const absPath = path.join(extractDir, relPath);
      let extracted;
      try {
        extracted = extractConfluencePage(
          await fs.readFile(absPath, 'utf-8'),
          relPath,
        );
      } catch {
        continue;
      }

      const pageDir = path.posix.dirname(relPath);
      if (extracted.breadcrumbParentHref) {
        const parentPath = resolveConfluenceHref(
          extracted.breadcrumbParentHref,
          pageDir,
          knownPaths,
        );
        if (parentPath && parentPath !== relPath) {
          page.parentPageId = pagesMap.get(parentPath)?.id ?? null;
        }
      }

      for (const childHref of extracted.childHrefs) {
        const childPath = resolveConfluenceHref(childHref, pageDir, knownPaths);
        if (!childPath || assigned.has(childPath)) {
          continue;
        }
        const child = pagesMap.get(childPath);
        if (child && !child.parentPageId) {
          child.parentPageId = page.id;
        }
      }
    }
  }
}
