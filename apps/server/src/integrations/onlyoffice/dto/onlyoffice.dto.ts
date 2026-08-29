import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class OnlyOfficeConfigDto {
  @IsUUID()
  @IsNotEmpty()
  attachmentId: string;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsIn(['view', 'edit'])
  mode?: 'view' | 'edit';
}

export class OnlyOfficePublicConfigDto {
  @IsUUID()
  @IsNotEmpty()
  attachmentId: string;

  @IsString()
  @IsNotEmpty()
  jwt: string;

  @IsOptional()
  @IsString()
  lang?: string;
}
