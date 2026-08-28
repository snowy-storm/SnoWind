import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplateService } from './template.service';
import { PageModule } from '../../core/page/page.module';

@Module({
  imports: [PageModule],
  controllers: [TemplatesController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplatesModule {}
