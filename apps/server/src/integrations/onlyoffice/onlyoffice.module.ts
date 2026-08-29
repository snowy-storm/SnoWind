import { Module } from '@nestjs/common';
import { TokenModule } from '../../core/auth/token.module';
import { AttachmentModule } from '../../core/attachment/attachment.module';
import { StorageModule } from '../storage/storage.module';
import { OnlyOfficeController } from './onlyoffice.controller';
import { OnlyOfficeService } from './onlyoffice.service';

@Module({
  imports: [TokenModule, AttachmentModule, StorageModule],
  controllers: [OnlyOfficeController],
  providers: [OnlyOfficeService],
})
export class OnlyOfficeModule {}
