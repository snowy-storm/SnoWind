import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@snowind/db/types/entity.types';
import { PagePermissionService } from './page-permission.service';
import {
  AddPagePermissionDto,
  ListPagePermissionsDto,
  PagePermissionPageDto,
  RemovePagePermissionDto,
  UpdatePagePermissionDto,
} from './dto/page-permission.dto';

@UseGuards(JwtAuthGuard)
@RequireSessionAuth()
@Controller('pages')
export class PagePermissionController {
  constructor(private readonly pagePermissionService: PagePermissionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('permission-info')
  async getRestrictionInfo(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.getRestrictionInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  async getPermissions(
    @Body() dto: ListPagePermissionsDto,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.getPermissions(dto.pageId, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  async restrict(@Body() dto: PagePermissionPageDto, @AuthUser() user: User) {
    await this.pagePermissionService.restrictPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-restriction')
  async unrestrict(@Body() dto: PagePermissionPageDto, @AuthUser() user: User) {
    await this.pagePermissionService.unrestrictPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add-permission')
  async addPermission(
    @Body() dto: AddPagePermissionDto,
    @AuthUser() user: User,
  ) {
    await this.pagePermissionService.addPermission(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-permission')
  async removePermission(
    @Body() dto: RemovePagePermissionDto,
    @AuthUser() user: User,
  ) {
    await this.pagePermissionService.removePermission(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-permission')
  async updatePermission(
    @Body() dto: UpdatePagePermissionDto,
    @AuthUser() user: User,
  ) {
    await this.pagePermissionService.updatePermission(dto, user);
  }
}
