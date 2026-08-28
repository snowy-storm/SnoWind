import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';

export class ListAuditLogsDto extends PaginationOptions {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class UpdateAuditRetentionDto {
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(3650)
  auditRetentionDays: number;
}
