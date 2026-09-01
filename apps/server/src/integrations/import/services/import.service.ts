import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { MultipartFile } from '@fastify/multipart';
import * as path from 'path';
import {
  htmlToJson,
  jsonToText,
  tiptapExtensions,
} from '../../../collaboration/collaboration.util';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import {
  generateSlugId,
  sanitizeFileName,
  createByteCountingStream,
  getMimeType,
} from '../../../common/helpers';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { markdownToHtml } from '@snowind/editor-ext';
import {
  FileTaskStatus,
  FileTaskType,
  getFileTaskFolderPath,
} from '../utils/file.utils';
import { v7 as uuid7 } from 'uuid';
import { StorageService } from '../../storage/storage.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../queue/constants';
import { load } from 'cheerio';
import { normalizeImportHtml } from '../utils/import-formatter';
import { AttachmentRepo } from '@snowind/db/repos/attachment/attachment.repo';
import { getAttachmentFolderPath } from '../../../core/attachment/attachment.utils';
import { AttachmentType } from '../../../core/attachment/attachment.constants';
import { DocxImportService } from '../../../ee/document-import/docx-import.service';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly storageService: StorageService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly docxImportService: DocxImportService,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.FILE_TASK_QUEUE)
    private readonly fileTaskQueue: Queue,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE)
    private readonly attachmentQueue: Queue,
  ) {}

  async importPage(
    filePromise: Promise<MultipartFile>,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const file = await filePromise;
    const fileBuffer = await file.toBuffer();
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileContent = fileBuffer.toString();

    let prosemirrorState = null;
    let createdPage = null;

    if (
      fileExtension === '.pdf' ||
      fileExtension === '.doc' ||
      fileExtension === '.docx' ||
      fileExtension === '.xlsx' ||
      fileExtension === '.xls' ||
      fileExtension === '.csv' ||
      fileExtension === '.ppt' ||
      fileExtension === '.pptx'
    ) {
      return this.importStoredFilePage(
        fileBuffer,
        fileName,
        file.filename,
        fileExtension,
        uuid7(),
        userId,
        spaceId,
        workspaceId,
      );
    }

    try {
      if (fileExtension.endsWith('.md')) {
        prosemirrorState = await this.processMarkdown(fileContent);
      } else if (fileExtension.endsWith('.html')) {
        prosemirrorState = await this.processHTML(fileContent);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error('Error processing file content', err);
      throw new BadRequestException(`Error processing file content: ${detail}`);
    }

    if (!prosemirrorState) {
      const message = 'Failed to create ProseMirror state';
      this.logger.error(message);
      throw new BadRequestException(message);
    }

    const { title, prosemirrorJson } = this.extractTitleAndRemoveHeading(
      prosemirrorState,
      { anyHeadingLevel: true },
    );

    const pageTitle = title || fileName;

    if (prosemirrorJson) {
      try {
        const pagePosition = await this.getNewPagePosition(spaceId);

        createdPage = await this.pageRepo.insertPage({
          slugId: generateSlugId(),
          title: pageTitle,
          content: prosemirrorJson,
          textContent: jsonToText(prosemirrorJson),
          ydoc: await this.createYdoc(prosemirrorJson),
          position: pagePosition,
          spaceId: spaceId,
          creatorId: userId,
          workspaceId: workspaceId,
          lastUpdatedById: userId,
        });

        this.logger.debug(
          `Successfully imported "${title}${fileExtension}. ID: ${createdPage.id} - SlugId: ${createdPage.slugId}"`,
        );
      } catch (err) {
        const message = 'Failed to create imported page';
        this.logger.error(message, err);
        throw new BadRequestException(message);
      }
    }

    return createdPage;
  }

  private async importStoredFilePage(
    fileBuffer: Buffer,
    pageTitle: string,
    originalFileName: string,
    fileExtension: string,
    pageId: string,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const originalBase = path.basename(originalFileName, fileExtension);
    const title =
      sanitizeFileName(originalBase, { preserveSpaces: true }).trim() ||
      pageTitle ||
      'document';
    const storageBase = pageTitle || 'document';
    const attachmentId = uuid7();
    const fileNameWithExt = `${storageBase}${fileExtension}`;
    const filePath = `${getAttachmentFolderPath(AttachmentType.File, workspaceId)}/${attachmentId}/${fileNameWithExt}`;
    const isPdf = fileExtension === '.pdf';
    const isSpreadsheet = ['.xlsx', '.xls', '.csv'].includes(fileExtension);
    const isSlide = ['.ppt', '.pptx'].includes(fileExtension);
    const fileType = isPdf
      ? 'pdf'
      : isSpreadsheet
        ? 'spreadsheet'
        : isSlide
          ? 'slide'
          : 'word';
    const mimeType = getMimeType(fileNameWithExt);
    const nodeType = isPdf ? 'pdf' : 'attachment';
    const fileSrc = `/api/files/${attachmentId}/${fileNameWithExt}`;
    const nodeAttrs = isPdf
      ? {
          src: fileSrc,
          name: fileNameWithExt,
          attachmentId,
          size: fileBuffer.length,
        }
      : {
          url: fileSrc,
          name: fileNameWithExt,
          mime: mimeType,
          attachmentId,
          size: fileBuffer.length,
        };

    const prosemirrorJson = {
      type: 'doc',
      content: [
        {
          type: nodeType,
          attrs: nodeAttrs,
        },
      ],
    };

    let ydoc: Buffer | null = null;
    try {
      ydoc = await this.createYdoc(prosemirrorJson);
    } catch (err) {
      this.logger.warn(
        `Failed to create ydoc for imported ${fileType} page`,
        err,
      );
    }

    try {
      await this.storageService.upload(filePath, fileBuffer);
    } catch (err) {
      this.logger.error(`Failed to store imported ${fileType} file`, err);
      throw new BadRequestException(`Failed to import ${fileType} file`);
    }

    try {
      const createdPage = await this.pageRepo.insertPage({
        id: pageId,
        slugId: generateSlugId(),
        title,
        content: prosemirrorJson,
        textContent: title,
        ydoc,
        position: await this.getNewPagePosition(spaceId),
        spaceId,
        creatorId: userId,
        workspaceId,
        lastUpdatedById: userId,
        fileType,
      });

      await this.attachmentRepo.insertAttachment({
        id: attachmentId,
        type: AttachmentType.File,
        filePath,
        fileName: fileNameWithExt,
        fileSize: BigInt(fileBuffer.length),
        mimeType,
        fileExt: fileExtension,
        creatorId: userId,
        workspaceId,
        pageId,
        spaceId,
      });

      try {
        if (['.pdf', '.docx', '.txt'].includes(fileExtension)) {
          await this.attachmentQueue.add(
            QueueJob.ATTACHMENT_INDEX_CONTENT,
            { attachmentId },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 10000 },
              deduplication: { id: attachmentId },
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to queue indexing for imported ${fileType} ${attachmentId}`,
          err,
        );
      }

      this.logger.debug(
        `Successfully imported ${fileType} "${fileNameWithExt}". ID: ${createdPage.id} - SlugId: ${createdPage.slugId}`,
      );

      return createdPage;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to create imported ${fileType} page`, err);
      throw new BadRequestException(`Failed to create imported page: ${detail}`);
    }
  }

  async getPageForConvert(pageId: string) {
    return this.pageRepo.findById(pageId);
  }

  async convertWordPageToSystemPage(
    sourcePageId: string,
    userId: string,
    workspaceId: string,
    keepOriginal: boolean,
  ) {
    const sourcePage = await this.pageRepo.findById(sourcePageId, {
      includeContent: true,
    });

    if (!sourcePage || sourcePage.deletedAt) {
      throw new BadRequestException('Page not found');
    }

    if (sourcePage.fileType !== 'word') {
      throw new BadRequestException('Only Word file pages can be converted');
    }

    if (sourcePage.workspaceId !== workspaceId) {
      throw new BadRequestException('Page not found');
    }

    const attachmentId = this.getFileAttachmentIdFromContent(sourcePage.content);
    if (!attachmentId) {
      throw new BadRequestException('Word file attachment not found');
    }

    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment?.filePath) {
      throw new BadRequestException('Word file attachment not found');
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await this.storageService.read(attachment.filePath);
    } catch (err) {
      this.logger.error('Failed to read Word file for conversion', err);
      throw new BadRequestException('Failed to read Word file');
    }

    const newPageId = uuid7();
    const emptyDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };

    let title: string | null = null;
    let prosemirrorJson: any = emptyDoc;

    if (fileBuffer.length > 0) {
      try {
        const html = await this.docxImportService.convertDocxToHtml(
          fileBuffer,
          workspaceId,
          sourcePage.spaceId,
          newPageId,
          userId,
        );
        const prosemirrorState = await this.processHTML(html || '<p></p>');
        const extracted = this.extractTitleAndRemoveHeading(
          prosemirrorState,
          { anyHeadingLevel: true },
        );
        title = extracted.title;
        prosemirrorJson = extracted.prosemirrorJson || emptyDoc;
      } catch (err) {
        this.logger.warn(
          'Word file had no convertible content; creating an empty system page',
          err,
        );
      }
    }

    const pageTitle =
      title ||
      sourcePage.title ||
      sanitizeFileName(
        path.basename(attachment.fileName || 'document', path.extname(attachment.fileName || '')),
        { preserveSpaces: true },
      ).trim() ||
      'Untitled';

    let ydoc: Buffer | null = null;
    try {
      ydoc = await this.createYdoc(prosemirrorJson);
    } catch (err) {
      this.logger.warn('Failed to create ydoc for converted Word page', err);
    }

    let textContent = '';
    try {
      textContent = jsonToText(prosemirrorJson);
    } catch {
      textContent = pageTitle;
    }

    const createdPage = await this.pageRepo.insertPage({
      id: newPageId,
      slugId: generateSlugId(),
      title: pageTitle,
      content: prosemirrorJson,
      textContent,
      ydoc,
      position: await this.getNewPagePosition(sourcePage.spaceId, sourcePage.id),
      parentPageId: sourcePage.id,
      spaceId: sourcePage.spaceId,
      creatorId: userId,
      workspaceId,
      lastUpdatedById: userId,
    });

    let deletedOriginal = false;
    if (!keepOriginal) {
      try {
        const nextSibling = await this.findNextSibling(sourcePage);
        const siblingPosition = generateJitteredKeyBetween(
          sourcePage.position,
          nextSibling?.position ?? null,
        );
        await this.pageRepo.updatePage(
          {
            parentPageId: sourcePage.parentPageId ?? null,
            position: siblingPosition,
          },
          createdPage.id,
        );
        await this.pageRepo.removePage(sourcePage.id, userId, workspaceId);
        deletedOriginal = true;
        createdPage.parentPageId = sourcePage.parentPageId ?? null;
        createdPage.position = siblingPosition;
      } catch (err) {
        this.logger.error(
          'Converted page was created but the original Word page could not be removed',
          err,
        );
        throw new BadRequestException(
          'Converted page was created, but the original Word file could not be deleted',
        );
      }
    }

    this.logger.debug(
      `Converted Word page ${sourcePage.id} to system page ${createdPage.id} (keepOriginal=${keepOriginal})`,
    );

    return { page: createdPage, deletedOriginal };
  }

  private getFileAttachmentIdFromContent(content: unknown): string | null {
    let parsed = content;
    if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const doc = parsed as {
      content?: Array<{ type?: string; attrs?: { attachmentId?: string } }>;
    };
    const node = doc.content?.find(
      (item) =>
        item?.type === 'pdf' ||
        item?.type === 'attachment' ||
        item?.type === 'word',
    );
    return typeof node?.attrs?.attachmentId === 'string'
      ? node.attrs.attachmentId
      : null;
  }

  private async findNextSibling(page: {
    id: string;
    spaceId: string;
    parentPageId: string | null;
    position: string;
  }) {
    let query = this.db
      .selectFrom('pages')
      .select(['id', 'position'])
      .where('spaceId', '=', page.spaceId)
      .where('deletedAt', 'is', null)
      .where('id', '!=', page.id)
      .where('position', '>', page.position)
      .orderBy('position', (ob) => ob.collate('C').asc())
      .limit(1);

    if (page.parentPageId) {
      query = query.where('parentPageId', '=', page.parentPageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async processMarkdown(markdownInput: string): Promise<any> {
    try {
      const html = await markdownToHtml(markdownInput);
      return this.processHTML(html);
    } catch (err) {
      throw err;
    }
  }

  async processHTML(htmlInput: string): Promise<any> {
    try {
      const $ = load(htmlInput);
      normalizeImportHtml($, $.root());
      return htmlToJson($.html() || '');
    } catch (err) {
      throw err;
    }
  }

  async createYdoc(prosemirrorJson: any): Promise<Buffer | null> {
    if (prosemirrorJson) {
      // this.logger.debug(`Converting prosemirror json state to ydoc`);

      const ydoc = TiptapTransformer.toYdoc(
        prosemirrorJson,
        'default',
        tiptapExtensions,
      );

      Y.encodeStateAsUpdate(ydoc);

      return Buffer.from(Y.encodeStateAsUpdate(ydoc));
    }
    return null;
  }

  extractTitleAndRemoveHeading(
    prosemirrorState: any,
    opts?: { anyHeadingLevel?: boolean },
  ) {
    let title: string | null = null;

    if (!prosemirrorState || typeof prosemirrorState !== 'object') {
      return {
        title,
        prosemirrorJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        },
      };
    }

    const content = Array.isArray(prosemirrorState.content)
      ? [...prosemirrorState.content]
      : [];
    const firstNode = content[0];

    const isTitleHeading =
      firstNode?.type === 'heading' &&
      (opts?.anyHeadingLevel || firstNode.attrs?.level === 1);

    if (isTitleHeading) {
      const headingText = (firstNode.content ?? [])
        .map((node: any) => node.text ?? '')
        .join('')
        .trim();

      if (headingText) {
        title = headingText;
        content.shift();
      }
    }

    // ensure at least one paragraph
    if (content.length === 0) {
      content.push({
        type: 'paragraph',
        content: [],
      });
    }

    return {
      title,
      prosemirrorJson: {
        ...prosemirrorState,
        content,
      },
    };
  }

  async getNewPagePosition(
    spaceId: string,
    parentPageId?: string,
  ): Promise<string> {
    let query = this.db
      .selectFrom('pages')
      .select(['id', 'position'])
      .where('spaceId', '=', spaceId)
      .orderBy('position', (ob) => ob.collate('C').desc())
      .limit(1);

    if (parentPageId) {
      query = query.where('parentPageId', '=', parentPageId);
    } else {
      query = query.where('parentPageId', 'is', null);
    }

    const lastPage = await query.executeTakeFirst();

    if (lastPage) {
      return generateJitteredKeyBetween(lastPage.position, null);
    } else {
      return generateJitteredKeyBetween(null, null);
    }
  }

  async importZip(
    filePromise: Promise<MultipartFile>,
    source: string,
    userId: string,
    spaceId: string,
    workspaceId: string,
  ) {
    const file = await filePromise;
    const fileExtension = path.extname(file.filename).toLowerCase();
    const fileName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileNameWithExt = fileName + fileExtension;

    const fileTaskId = uuid7();
    const filePath = `${getFileTaskFolderPath(FileTaskType.Import, workspaceId)}/${fileTaskId}/${fileNameWithExt}`;

    // upload file
    const { stream, getBytesRead } = createByteCountingStream(file.file);

    await this.storageService.upload(filePath, stream);

    const fileSize = getBytesRead();

    const fileTask = await this.db
      .insertInto('fileTasks')
      .values({
        id: fileTaskId,
        type: FileTaskType.Import,
        source: source,
        status: FileTaskStatus.Processing,
        fileName: fileNameWithExt,
        filePath: filePath,
        fileSize: fileSize,
        fileExt: 'zip',
        creatorId: userId,
        spaceId: spaceId,
        workspaceId: workspaceId,
      })
      .returningAll()
      .executeTakeFirst();

    await this.fileTaskQueue.add(QueueJob.IMPORT_TASK, {
      fileTaskId: fileTaskId,
    });

    return fileTask;
  }
}
