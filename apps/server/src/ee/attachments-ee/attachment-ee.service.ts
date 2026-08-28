// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AttachmentEeService {
  private readonly logger = new Logger(AttachmentEeService.name);

  async indexAttachment(_attachmentId: string): Promise<void> {
    this.logger.debug('Attachment indexing service not implemented');
  }

  async indexAttachments(_workspaceId: string): Promise<void> {
    this.logger.debug('Bulk attachment indexing service not implemented');
  }
}
