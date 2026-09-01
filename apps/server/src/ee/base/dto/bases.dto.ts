// @ts-nocheck
import { IsOptional, IsString, IsNotEmpty, IsArray, IsObject, IsEnum, IsNumber, IsBoolean, ArrayNotEmpty, Max, Min } from 'class-validator';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { Transform, Type } from 'class-transformer';

export class PageIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class CreateBaseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsString()
  @IsNotEmpty()
  spaceId: string;
}

export class UpdateBaseDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class ConvertBaseDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  @IsEnum(['kanban'])
  template?: 'kanban';
}

export class ConvertSpreadsheetPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sheetNames: string[];

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  keepOriginal: boolean;
}

export class ListBasesDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsOptional()
  @Type(() => PaginationOptions)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export class ExportBaseDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsObject()
  filter?: any;
}

// --- Properties ---

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsObject()
  typeOptions?: any;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class UpdatePropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  typeOptions?: any;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeletePropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ReorderPropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

// --- Rows ---

export class CreateRowDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsObject()
  cells?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  afterRowId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class RowIdDto {
  @IsString()
  @IsNotEmpty()
  rowId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class UpdateRowDto {
  @IsString()
  @IsNotEmpty()
  rowId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsObject()
  cells: Record<string, unknown>;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeleteRowDto {
  @IsString()
  @IsNotEmpty()
  rowId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class DeleteRowsDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsArray()
  @IsString({ each: true })
  rowIds: string[];

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ListRowsDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsObject()
  filter?: any;

  @IsOptional()
  @IsArray()
  sorts?: Array<{ propertyId: string; direction: 'asc' | 'desc' }>;
}

export class ReorderRowDto {
  @IsString()
  @IsNotEmpty()
  rowId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

// --- Views ---

export class CreateViewDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class UpdateViewDto {
  @IsString()
  @IsNotEmpty()
  viewId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  config?: any;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}

export class DeleteViewDto {
  @IsString()
  @IsNotEmpty()
  viewId: string;

  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class ListViewsDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}
