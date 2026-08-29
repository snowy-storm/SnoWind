import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import { Attachment, User } from '@snowind/db/types/entity.types';
import { AttachmentRepo } from '@snowind/db/repos/attachment/attachment.repo';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { EnvironmentService } from '../environment/environment.service';
import { TokenService } from '../../core/auth/services/token.service';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { AttachmentService } from '../../core/attachment/services/attachment.service';
import {
  JwtAttachmentPayload,
  JwtOnlyOfficePayload,
  JwtType,
} from '../../core/auth/dto/jwt-payload';
import { getMimeType } from '../../common/helpers';
import { ONLYOFFICE_STATUS } from './onlyoffice.constants';
import {
  buildDocumentKey,
  fileExtFromUrl,
  getOnlyOfficeDocumentType,
  isOnlyOfficeFile,
  isSameOfficeFamily,
  normalizeFileExt,
  stripTrailingSlash,
} from './onlyoffice.util';

export type OnlyOfficeCallbackBody = {
  key?: string;
  status?: number;
  url?: string;
  token?: string;
  [key: string]: unknown;
};

@Injectable()
export class OnlyOfficeService {
  private readonly logger = new Logger(OnlyOfficeService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly tokenService: TokenService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly attachmentService: AttachmentService,
  ) {}

  isEnabled(): boolean {
    return this.environmentService.isOnlyOfficeEnabled();
  }

  assertEnabled() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('OnlyOffice is not configured');
    }
  }

  async buildEditorConfig(opts: {
    attachment: Attachment;
    workspaceId: string;
    canEdit: boolean;
    user?: Pick<User, 'id' | 'name'>;
    lang?: string;
  }) {
    this.assertEnabled();

    const { attachment, workspaceId, canEdit, user } = opts;
    const ext = normalizeFileExt(attachment.fileExt || attachment.fileName);
    const documentType = getOnlyOfficeDocumentType(ext);
    if (!documentType || !isOnlyOfficeFile(ext, attachment.mimeType)) {
      throw new BadRequestException('This file type cannot be opened in OnlyOffice');
    }

    const fileToken = await this.tokenService.generateOnlyOfficeToken({
      attachmentId: attachment.id,
      workspaceId,
      userId: user?.id,
      canEdit,
    });

    const appUrl = this.environmentService.getOnlyOfficeAppUrl();
    const encodedName = encodeURIComponent(attachment.fileName);
    const documentUrl = `${appUrl}/api/onlyoffice/files/${fileToken}/${encodedName}`;
    const callbackUrl = `${appUrl}/api/onlyoffice/callback/${fileToken}`;
    const fileType = ext.replace('.', '');

    const config: Record<string, unknown> = {
      documentType,
      document: {
        fileType,
        key: buildDocumentKey(attachment.id, attachment.updatedAt as Date),
        title: attachment.fileName,
        url: documentUrl,
        permissions: {
          edit: canEdit,
          download: true,
          print: true,
          comment: canEdit,
          review: canEdit,
          chat: false,
        },
      },
      editorConfig: {
        callbackUrl,
        lang: this.mapLang(opts.lang),
        mode: canEdit ? 'edit' : 'view',
        user: {
          id: user?.id || 'anonymous',
          name: user?.name || 'Guest',
        },
        customization: canEdit
          ? {
              autosave: true,
              comments: true,
              compactHeader: true,
              forcesave: true,
              help: false,
              hideRightMenu: true,
              leftMenu: true,
              plugins: false,
            }
          : {
              autosave: true,
              comments: false,
              compactHeader: true,
              compactToolbar: true,
              forcesave: true,
              help: false,
              hideRightMenu: true,
              leftMenu: true,
              plugins: false,
              layout: {
                leftMenu: {
                  mode: true,
                  navigation: true,
                },
                rightMenu: false,
                toolbar: {
                  view: {
                    navigation: true,
                  },
                },
              },
            },
      },
    };

    const token = this.signOnlyOfficeJwt(config);
    return {
      documentServerUrl: this.environmentService.getOnlyOfficeUrl(),
      config: { ...config, token },
    };
  }

  async getConfigForUser(
    attachmentId: string,
    user: User,
    workspaceId: string,
    lang?: string,
    mode?: 'view' | 'edit',
  ) {
    const attachment = await this.requireOfficeAttachment(
      attachmentId,
      workspaceId,
    );
    const page = await this.requirePage(attachment);

    const { canEdit } =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);

    return this.buildEditorConfig({
      attachment,
      workspaceId,
      canEdit: mode === 'view' ? false : canEdit,
      user,
      lang,
    });
  }

  async getConfigForShare(
    attachmentId: string,
    shareJwt: string,
    workspaceId: string,
    lang?: string,
  ) {
    let jwtPayload: JwtAttachmentPayload;
    try {
      jwtPayload = await this.tokenService.verifyJwt(
        shareJwt,
        JwtType.ATTACHMENT,
      );
    } catch {
      throw new BadRequestException('Expired or invalid attachment access token');
    }

    if (
      jwtPayload.attachmentId !== attachmentId ||
      jwtPayload.workspaceId !== workspaceId
    ) {
      throw new ForbiddenException();
    }

    const attachment = await this.requireOfficeAttachment(
      attachmentId,
      workspaceId,
    );
    if (jwtPayload.pageId !== attachment.pageId) {
      throw new ForbiddenException();
    }

    return this.buildEditorConfig({
      attachment,
      workspaceId,
      canEdit: false,
      lang,
    });
  }

  async verifyFileToken(token: string): Promise<JwtOnlyOfficePayload> {
    return this.tokenService.verifyJwt(token, JwtType.ONLYOFFICE);
  }

  async getAttachmentForToken(
    tokenPayload: JwtOnlyOfficePayload,
    workspaceId: string,
  ): Promise<Attachment> {
    if (tokenPayload.workspaceId !== workspaceId) {
      throw new NotFoundException('File not found');
    }
    return this.requireOfficeAttachment(
      tokenPayload.attachmentId,
      workspaceId,
    );
  }

  async handleCallback(
    token: string,
    body: OnlyOfficeCallbackBody,
    authorization?: string,
    workspaceId?: string,
  ): Promise<{ error: number }> {
    this.assertEnabled();

    let payload: JwtOnlyOfficePayload;
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.ONLYOFFICE);
    } catch {
      this.logger.warn('OnlyOffice callback with invalid file token');
      return { error: 1 };
    }

    if (workspaceId && payload.workspaceId !== workspaceId) {
      return { error: 1 };
    }

    const callback = this.decodeCallbackBody(body, authorization);
    const status = callback.status;

    if (
      status !== ONLYOFFICE_STATUS.READY_TO_SAVE &&
      status !== ONLYOFFICE_STATUS.FORCE_SAVE
    ) {
      return { error: 0 };
    }

    if (!payload.canEdit) {
      this.logger.warn(
        `OnlyOffice save ignored for view-only token ${payload.attachmentId}`,
      );
      return { error: 0 };
    }

    if (!callback.url) {
      this.logger.error('OnlyOffice callback missing document url');
      return { error: 1 };
    }

    try {
      const attachment = await this.requireOfficeAttachment(
        payload.attachmentId,
        payload.workspaceId,
      );
      const buffer = await this.downloadFromDocumentServer(callback.url);
      const downloadedExt = fileExtFromUrl(callback.url);
      const currentExt = normalizeFileExt(attachment.fileExt || attachment.fileName);

      if (
        downloadedExt &&
        downloadedExt !== currentExt &&
        !isSameOfficeFamily(downloadedExt, currentExt)
      ) {
        this.logger.error(
          `OnlyOffice saved unexpected type ${downloadedExt} for ${currentExt}`,
        );
        return { error: 1 };
      }

      const nextExt = downloadedExt || currentExt;
      await this.attachmentService.replaceFileContent({
        attachment,
        buffer,
        fileExt: nextExt,
      });
      if (payload.userId && attachment.pageId) {
        await this.pageRepo.updatePage(
          { lastUpdatedById: payload.userId },
          attachment.pageId,
        );
      }
      return { error: 0 };
    } catch (err) {
      this.logger.error('Failed to save OnlyOffice document', err);
      return { error: 1 };
    }
  }

  contentTypeFor(attachment: Attachment): string {
    return attachment.mimeType || getMimeType(attachment.fileName);
  }

  private async requireOfficeAttachment(
    attachmentId: string,
    workspaceId: string,
  ): Promise<Attachment> {
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (
      !attachment ||
      attachment.workspaceId !== workspaceId ||
      !attachment.pageId
    ) {
      throw new NotFoundException('File not found');
    }
    if (!isOnlyOfficeFile(attachment.fileExt || attachment.fileName, attachment.mimeType)) {
      throw new BadRequestException('This file type cannot be opened in OnlyOffice');
    }
    return attachment;
  }

  private async requirePage(attachment: Attachment) {
    const page = await this.pageRepo.findById(attachment.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private signOnlyOfficeJwt(payload: object): string {
    const secret = this.environmentService.getOnlyOfficeJwtSecret();
    return sign(payload, secret, { algorithm: 'HS256', expiresIn: '12h' });
  }

  private decodeCallbackBody(
    body: OnlyOfficeCallbackBody,
    authorization?: string,
  ): OnlyOfficeCallbackBody {
    const secret = this.environmentService.getOnlyOfficeJwtSecret();
    const headerToken = this.bearerToken(authorization);
    const token = body?.token || headerToken;
    if (!token) {
      return body;
    }

    try {
      const decoded = verify(token, secret, {
        algorithms: ['HS256'],
      }) as OnlyOfficeCallbackBody & { payload?: OnlyOfficeCallbackBody };
      if (decoded?.payload && typeof decoded.payload === 'object') {
        return { ...body, ...decoded.payload };
      }
      return { ...body, ...decoded };
    } catch (err) {
      this.logger.warn('Invalid OnlyOffice callback JWT', err);
      throw new ForbiddenException('Invalid OnlyOffice token');
    }
  }

  private bearerToken(authorization?: string): string | undefined {
    if (!authorization) return undefined;
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }

  private async downloadFromDocumentServer(url: string): Promise<Buffer> {
    const secret = this.environmentService.getOnlyOfficeJwtSecret();
    const dsToken = sign({ payload: { url } }, secret, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${dsToken}` },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download edited file from OnlyOffice (${response.status})`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private mapLang(lang?: string): string {
    if (!lang) return 'en';
    const normalized = lang.replace('_', '-');
    if (normalized.toLowerCase().startsWith('zh')) return 'zh-CN';
    return normalized;
  }
}
