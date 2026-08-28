import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';
import { DocxExportService } from '../../ee/document-export/docx-export.service';

@Module({
  imports: [StorageModule],
  providers: [ExportService, DocxExportService],
  controllers: [ExportController],
})
export class ExportModule {}
