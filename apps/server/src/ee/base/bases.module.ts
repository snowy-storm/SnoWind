// @ts-nocheck
import { Module } from '@nestjs/common';
import { BasesController } from './bases.controller';
import { BaseService } from './base.service';
import { BaseWsService } from './realtime/base-ws.service';
import { PageModule } from '../../core/page/page.module';

@Module({
  imports: [PageModule],
  controllers: [BasesController],
  providers: [BaseService, BaseWsService],
  exports: [BaseService, BaseWsService],
})
export class BasesModule {}
