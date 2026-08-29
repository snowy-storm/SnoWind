import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { StorageService } from '../storage/storage.service';
import { OnlyOfficeService } from './onlyoffice.service';
import {
  OnlyOfficeConfigDto,
  OnlyOfficePublicConfigDto,
} from './dto/onlyoffice.dto';

@Controller('onlyoffice')
export class OnlyOfficeController {
  private readonly logger = new Logger(OnlyOfficeController.name);

  constructor(
    private readonly onlyOfficeService: OnlyOfficeService,
    private readonly storageService: StorageService,
  ) {}

  @Get('status')
  @HttpCode(HttpStatus.OK)
  status() {
    return { enabled: this.onlyOfficeService.isEnabled() };
  }

  @UseGuards(JwtAuthGuard)
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async config(
    @Body() dto: OnlyOfficeConfigDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.onlyOfficeService.getConfigForUser(
      dto.attachmentId,
      user,
      workspace.id,
      dto.lang,
      dto.mode,
    );
  }

  @Post('public-config')
  @HttpCode(HttpStatus.OK)
  async publicConfig(
    @Body() dto: OnlyOfficePublicConfigDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.onlyOfficeService.getConfigForShare(
      dto.attachmentId,
      dto.jwt,
      workspace.id,
      dto.lang,
    );
  }

  @SkipTransform()
  @Get('files/:token/:fileName')
  async getFile(
    @Param('token') token: string,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const payload = await this.onlyOfficeService.verifyFileToken(token);
    const attachment = await this.onlyOfficeService.getAttachmentForToken(
      payload,
      workspace.id,
    );

    try {
      const stream = await this.storageService.readStream(attachment.filePath);
      res.headers({
        'Content-Type': this.onlyOfficeService.contentTypeFor(attachment),
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
      });
      if (attachment.fileSize) {
        res.header('Content-Length', Number(attachment.fileSize));
      }
      return res.send(stream);
    } catch (err) {
      this.logger.error(err);
      throw new NotFoundException('File not found');
    }
  }

  @SkipTransform()
  @Post('callback/:token')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/json')
  async callback(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.onlyOfficeService.handleCallback(
      token,
      body,
      authorization,
      workspace.id,
    );
  }
}
