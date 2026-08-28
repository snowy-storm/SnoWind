import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';

export const VERIFICATION_TYPES = ['expiring', 'qms'] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const EXPIRATION_MODES = ['period', 'fixed', 'indefinite'] as const;
export type ExpirationMode = (typeof EXPIRATION_MODES)[number];

export const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;
export type PeriodUnit = (typeof PERIOD_UNITS)[number];

export const MAX_VERIFIERS = 5;

export class PageVerificationPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class SetupVerificationDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: VerificationType;

  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: ExpirationMode;

  @ValidateIf((o) => o.mode === 'period')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodAmount?: number;

  @ValidateIf((o) => o.mode === 'period')
  @IsIn(PERIOD_UNITS)
  periodUnit?: PeriodUnit;

  @ValidateIf((o) => o.mode === 'fixed')
  @IsISO8601()
  fixedExpiresAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VERIFIERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  verifierIds: string[];
}

export class UpdateVerificationDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: ExpirationMode;

  @ValidateIf((o) => o.mode === 'period')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodAmount?: number;

  @ValidateIf((o) => o.mode === 'period')
  @IsIn(PERIOD_UNITS)
  periodUnit?: PeriodUnit;

  @ValidateIf((o) => o.mode === 'fixed')
  @IsISO8601()
  fixedExpiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_VERIFIERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  verifierIds?: string[];
}

export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class ListVerificationsDto extends PaginationOptions {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  spaceIds?: string[];

  @IsOptional()
  @IsUUID()
  verifierId?: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: VerificationType;
}
