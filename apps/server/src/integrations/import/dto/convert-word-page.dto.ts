import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class ConvertWordPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  keepOriginal: boolean;
}
