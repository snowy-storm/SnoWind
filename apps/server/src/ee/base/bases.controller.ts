// @ts-nocheck
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import { BaseService } from './base.service';
import * as bytes from 'bytes';
import * as path from 'path';
import {
  ConvertBaseDto,
  CreateBaseDto,
  CreatePropertyDto,
  CreateRowDto,
  CreateViewDto,
  DeletePropertyDto,
  DeleteRowDto,
  DeleteRowsDto,
  DeleteViewDto,
  ExportBaseDto,
  ListBasesDto,
  ListRowsDto,
  ListViewsDto,
  ReorderPropertyDto,
  ReorderRowDto,
  RowIdDto,
  UpdateBaseDto,
  UpdatePropertyDto,
  UpdateRowDto,
  UpdateViewDto,
} from './dto/bases.dto';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { PageRepo } from '@snowind/db/repos/page/page.repo';
import { User, Workspace } from '@snowind/db/types/entity.types';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { sanitizeFileName } from '../../common/helpers';

@UseGuards(JwtAuthGuard)
@Controller('bases')
export class BasesController {
  private readonly logger = new Logger(BasesController.name);

  constructor(
    private readonly baseService: BaseService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageRepo: PageRepo,
  ) {}

  private async readTableUpload(req: any) {
    const maxFileSize = bytes('30mb');
    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 4, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          'File too large. Exceeds the 30mb import limit',
        );
      }
      throw new BadRequestException('Failed to upload file');
    }

    if (!file) {
      throw new BadRequestException('Failed to upload file');
    }

    const ext = path.extname(file.filename).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      throw new BadRequestException('Invalid import file type.');
    }

    const buffer = await file.toBuffer();
    const fileName = sanitizeFileName(
      path.basename(file.filename, ext),
      { preserveSpaces: true },
    );
    return { file, buffer, fileName: fileName || 'table', ext };
  }

  private async assertCanEditSpaceByPage(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId, { includeSpace: true });
    if (!page) throw new BadRequestException('Page not found');
    const ability = await this.spaceAbility.createForUser(
      user,
      page.spaceId,
    );
    if (
      !ability.can(
        SpaceCaslAction.Manage,
        SpaceCaslSubject.Settings,
      ) && !ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)
    ) {
      throw new ForbiddenException('Insufficient space permissions');
    }
    return page;
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createBase(
    @Body() dto: CreateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      dto.spaceId,
    );
    if (!ability.can(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('Cannot create pages in this space');
    }
    return this.baseService.createBase(dto, workspace.id, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getBaseInfo(
    @Body() dto: { pageId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.getBaseInfo(dto.pageId, workspace.id, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateBase(
    @Body() dto: UpdateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.updateBase(dto, workspace.id, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteBase(
    @Body() dto: { pageId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.deleteBase(dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  async convertPageToBase(
    @Body() dto: ConvertBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.convertPageToBase(
      dto.pageId,
      dto.template,
      workspace.id,
      user,
    );
  }

  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('import-table/sheets')
  async listTableSheets(@Req() req: any) {
    const { buffer, fileName, ext } = await this.readTableUpload(req);
    return this.baseService.listTableSheets(buffer, fileName + ext);
  }

  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('import-table')
  async importTable(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { file, buffer, fileName, ext } = await this.readTableUpload(req);
    const spaceId = file.fields?.spaceId?.value;
    if (!spaceId) {
      throw new BadRequestException('spaceId is required');
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (!ability.can(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('Cannot create pages in this space');
    }

    let sheetNames: string[] | undefined;
    const sheetNamesRaw = file.fields?.sheetNames?.value;
    if (sheetNamesRaw) {
      try {
        const parsed = JSON.parse(sheetNamesRaw);
        if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== 'string')) {
          throw new Error('invalid');
        }
        sheetNames = parsed;
      } catch {
        throw new BadRequestException('Invalid sheetNames');
      }
    }

    return this.baseService.importTable(
      buffer,
      fileName + ext,
      sheetNames,
      spaceId,
      workspace.id,
      user,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('export-csv')
  async exportBaseToCsv(
    @Body() dto: ExportBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    const csv = await this.baseService.exportBaseToCsv(
      dto.pageId,
      workspace.id,
      dto.filter,
    );
    const page = await this.pageRepo.findById(dto.pageId);
    const filename = `${sanitizeFileName(page?.title || 'base', { preserveSpaces: true }) || 'base'}.csv`;
    const encoded = encodeURIComponent(filename);
    res.header(
      'Content-Disposition',
      `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    );
    res.header('Content-Type', 'text/csv; charset=utf-8');
    return res.send('\uFEFF' + csv);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async listBases(
    @Body() dto: ListBasesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      dto.spaceId,
    );
    if (!ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException('Cannot view this space');
    }
    const pagination: PaginationOptions = {
      cursor: dto.cursor,
      limit: dto.limit ?? 50,
    };
    return this.baseService.listBases(dto.spaceId, workspace.id, pagination);
  }

  // --- Properties ---

  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  async createProperty(
    @Body() dto: CreatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.createProperty(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  async updateProperty(
    @Body() dto: UpdatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.updateProperty(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  async deleteProperty(
    @Body() dto: DeletePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.deleteProperty(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/reorder')
  async reorderProperty(
    @Body() dto: ReorderPropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.reorderProperty(dto, workspace.id);
  }

  // --- Rows ---

  @HttpCode(HttpStatus.OK)
  @Post('rows/create')
  async createRow(
    @Body() dto: CreateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.createRow(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/info')
  async getRowInfo(
    @Body() dto: RowIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.getRowInfo(dto.rowId, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/update')
  async updateRow(
    @Body() dto: UpdateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.updateRow(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete')
  async deleteRow(
    @Body() dto: DeleteRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.deleteRow(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete-many')
  async deleteRows(
    @Body() dto: DeleteRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.deleteRows(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows')
  async listRows(
    @Body() dto: ListRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    const pagination: PaginationOptions = {
      cursor: dto.cursor,
      limit: dto.limit ?? 50,
    };
    return this.baseService.listRows(dto.pageId, workspace.id, pagination, {
      sorts: dto.sorts,
      filter: dto.filter,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/reorder')
  async reorderRow(
    @Body() dto: ReorderRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.reorderRow(dto, workspace.id);
  }

  // --- Views ---

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  async createView(
    @Body() dto: CreateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.createView(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  async updateView(
    @Body() dto: UpdateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.updateView(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  async deleteView(
    @Body() dto: DeleteViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    await this.baseService.deleteView(dto, workspace.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views')
  async listViews(
    @Body() dto: ListViewsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpaceByPage(dto.pageId, user);
    return this.baseService.listViews(dto.pageId, workspace.id, user.id);
  }
}
