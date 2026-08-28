// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import * as mammoth from 'mammoth';
import { v7 as uuid7 } from 'uuid';
import { imageDimensionsFromData } from 'image-dimensions';
import { StorageService } from '../../integrations/storage/storage.service';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { getMimeType } from '../../common/helpers';
import { AttachmentRepo } from '../../database/repos/attachment/attachment.repo';

type ImportedImageAttrs = {
  src: string;
  'data-attachment-id'?: string;
  'data-size'?: string;
  'data-align'?: string;
  width?: string;
  height?: string;
  'data-aspect-ratio'?: string;
};

@Injectable()
export class DocxImportService {
  private readonly logger = new Logger(DocxImportService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly attachmentRepo: AttachmentRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const result = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement((image) =>
          this.convertImage(image, workspaceId, spaceId, pageId, userId),
        ),
      },
    );

    if (result.messages.length > 0) {
      this.logger.debug(
        `mammoth conversion warnings: ${JSON.stringify(result.messages)}`,
      );
    }

    return result.value;
  }

  private async convertImage(
    image: mammoth.Image,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<ImportedImageAttrs> {
    try {
      const attachmentId = uuid7();

      const mimeType =
        image.contentType?.split(';')[0]?.trim() || 'image/png';
      let ext = mimeType.split('/')[1] || 'png';
      if (ext === 'jpeg') ext = 'jpg';
      ext = ext.toLowerCase();
      const fileName = `${attachmentId}.${ext}`;
      const fileExt = `.${ext}`;

      const imageBuffer = await image.read();
      const fileSize = imageBuffer.length;

      const filePath = `${getAttachmentFolderPath(AttachmentType.File, workspaceId)}/${attachmentId}/${fileName}`;

      await this.storageService.upload(filePath, imageBuffer);

      await this.attachmentRepo.insertAttachment({
        id: attachmentId,
        type: AttachmentType.File,
        filePath,
        fileName,
        fileSize: BigInt(fileSize),
        mimeType: mimeType || getMimeType(fileName),
        fileExt,
        creatorId: userId,
        workspaceId,
        pageId,
        spaceId,
      });

      const attrs: ImportedImageAttrs = {
        src: `/api/files/${attachmentId}/${fileName}`,
        'data-attachment-id': attachmentId,
        'data-size': String(fileSize),
        'data-align': 'center',
      };

      const natural = imageDimensionsFromData(new Uint8Array(imageBuffer));
      if (natural?.width && natural?.height) {
        attrs.width = String(natural.width);
        attrs.height = String(natural.height);
        attrs['data-aspect-ratio'] = String(natural.width / natural.height);
      }

      return attrs;
    } catch (err) {
      this.logger.error('Failed to convert embedded image', err);
      return { src: '' };
    }
  }
}
