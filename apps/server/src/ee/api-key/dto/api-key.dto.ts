import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';

export class ListApiKeysDto extends PaginationOptions {}

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class RevokeApiKeyDto {
  @IsUUID()
  apiKeyId: string;
}
