import { IsObject, IsUUID } from 'class-validator';

export class UpdateWordExportStyleDto {
  @IsUUID()
  spaceId: string;

  @IsObject()
  style: Record<string, unknown>;
}
