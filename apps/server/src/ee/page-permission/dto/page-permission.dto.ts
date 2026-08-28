import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { PagePermissionRole } from '../../../common/helpers/types/permission';

export class PagePermissionPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class ListPagePermissionsDto extends PaginationOptions {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class AddPagePermissionDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class RemovePagePermissionDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdatePagePermissionDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;

  @ValidateIf((o) => !o.groupId)
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsUUID()
  groupId?: string;
}
