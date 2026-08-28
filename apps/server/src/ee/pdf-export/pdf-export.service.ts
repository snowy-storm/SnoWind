// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { StorageService } from '../../integrations/storage/storage.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import * as FormData from 'form-data';
import { v7 as uuid7 } from 'uuid';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { PageRepo } from '../../database/repos/page/page.repo';

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);
  private readonly PDF_EXPIRE_HOURS = 24;

  constructor(
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async generateAndStorePdf(fileTaskId: string): Promise<void> {
    const gotenbergUrl = this.environmentService.getGotenbergUrl();
    if (!gotenbergUrl) {
      await this.updateFileTaskStatus(fileTaskId, 'failed', null, 'Gotenberg URL not configured');
      this.logger.warn('GOTENBERG_URL is not set, PDF export aborted');
      return;
    }

    const fileTask = await this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', fileTaskId)
      .executeTakeFirst();

    if (!fileTask) {
      this.logger.warn(`FileTask ${fileTaskId} not found`);
      return;
    }

    if (!fileTask.pageId) {
      await this.updateFileTaskStatus(fileTaskId, 'failed', null, 'No pageId associated with fileTask');
      return;
    }

    try {
      const page = await this.pageRepo.findById(fileTask.pageId, {
        includeContent: false,
      });

      if (!page) {
        await this.updateFileTaskStatus(fileTaskId, 'failed', null, 'Page not found');
        return;
      }

      const appUrl = this.environmentService.getAppUrl();
      const token = this.generateExportToken();
      const renderUrl = `${appUrl}/pdf-render?token=${encodeURIComponent(token)}&pageId=${encodeURIComponent(fileTask.pageId)}&workspaceId=${encodeURIComponent(fileTask.workspaceId)}`;

      this.logger.debug(`PDF render URL: ${renderUrl}`);

      const pdfBuffer = await this.callGotenbergUrlConvert(
        gotenbergUrl,
        renderUrl,
      );

      const fileExt = '.pdf';
      const fileName = `${fileTask.fileName?.replace(/\.pdf$/i, '') || 'export'}.pdf`;
      const attachmentId = uuid7();
      const filePath = `${getAttachmentFolderPath(AttachmentType.File, fileTask.workspaceId)}/${attachmentId}/${fileName}`;

      await this.storageService.upload(filePath, pdfBuffer);

      const fileSize = pdfBuffer.length;

      await this.updateFileTaskStatus(
        fileTaskId,
        'completed',
        filePath,
        null,
        fileSize,
        fileExt,
        fileName,
      );

      this.logger.log(`PDF export completed for fileTask: ${fileTaskId}`);
    } catch (err) {
      this.logger.error(`PDF export failed for fileTask: ${fileTaskId}`, err);
      await this.updateFileTaskStatus(
        fileTaskId,
        'failed',
        null,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async cleanupExpiredExports(): Promise<void> {
    const cutoff = new Date(Date.now() - this.PDF_EXPIRE_HOURS * 60 * 60 * 1000);

    this.logger.debug(`Cleaning up PDF exports older than ${cutoff.toISOString()}`);

    const expiredTasks = await this.db
      .selectFrom('fileTasks')
      .select(['id', 'filePath', 'workspaceId'])
      .where('type', '=', 'pdf_export')
      .where('createdAt', '<', cutoff)
      .where('deletedAt', 'is', null)
      .execute();

    if (expiredTasks.length === 0) {
      this.logger.debug('No expired PDF exports to clean up');
      return;
    }

    this.logger.log(`Found ${expiredTasks.length} expired PDF export tasks to clean up`);

    let deletedCount = 0;
    for (const task of expiredTasks) {
      try {
        if (task.filePath) {
          try {
            await this.storageService.delete(task.filePath);
          } catch (storageErr) {
            this.logger.warn(
              `Failed to delete stored file for expired PDF task ${task.id}: ${storageErr}`,
            );
          }
        }

        await this.db
          .updateTable('fileTasks')
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where('id', '=', task.id)
          .execute();

        deletedCount++;
      } catch (err) {
        this.logger.error(
          `Failed to clean up expired PDF task ${task.id}`,
          err,
        );
      }
    }

    this.logger.log(`Cleaned up ${deletedCount}/${expiredTasks.length} expired PDF export tasks`);
  }

  private async callGotenbergUrlConvert(
    gotenbergBaseUrl: string,
    url: string,
  ): Promise<Buffer> {
    const endpoint = `${gotenbergBaseUrl.replace(/\/$/, '')}/forms/chromium/convert/url`;

    const form = new FormData();
    form.append('url', url);
    form.append('marginTop', '0.5');
    form.append('marginBottom', '0.5');
    form.append('marginLeft', '0.5');
    form.append('marginRight', '0.5');
    form.append('printBackground', 'true');
    form.append('preferCssPageSize', 'true');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
      },
      body: form as any,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Gotenberg URL conversion failed (status ${response.status}): ${errorText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async updateFileTaskStatus(
    fileTaskId: string,
    status: string,
    filePath: string | null,
    errorMessage: string | null,
    fileSize?: number,
    fileExt?: string,
    fileName?: string,
  ): Promise<void> {
    const updates: Record<string, any> = {
      status,
      errorMessage,
      updatedAt: new Date(),
    };

    if (filePath !== undefined) {
      updates.filePath = filePath;
    }
    if (fileSize !== undefined) {
      updates.fileSize = BigInt(fileSize);
    }
    if (fileExt !== undefined) {
      updates.fileExt = fileExt;
    }
    if (fileName !== undefined) {
      updates.fileName = fileName;
    }

    await this.db
      .updateTable('fileTasks')
      .set(updates)
      .where('id', '=', fileTaskId)
      .execute();
  }

  private generateExportToken(): string {
    return uuid7();
  }
}
