import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class MfaSetupDto {
  @IsIn(['totp'])
  method: 'totp';
}

export class MfaEnableDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  verificationCode: string;
}

export class MfaPasswordConfirmDto {
  @IsOptional()
  @IsString()
  confirmPassword?: string;
}

export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  code: string;
}
