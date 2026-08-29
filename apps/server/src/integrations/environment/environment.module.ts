import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { envDevPath, envFilePaths, envPath } from '../../common/helpers';
import { validate } from './environment.validation';
import { EnvironmentService } from './environment.service';
import { DomainService } from './domain.service';
import { LicenseCheckService } from './license-check.service';

dotenv.config({ path: envPath });
dotenv.config({ path: envDevPath, override: true });

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: envFilePaths,
      validate,
    }),
  ],
  providers: [EnvironmentService, DomainService, LicenseCheckService],
  exports: [EnvironmentService, DomainService, LicenseCheckService],
})
export class EnvironmentModule {}
