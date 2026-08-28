import { Module } from '@nestjs/common';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationSchedulerService } from './page-verification-scheduler.service';
import { PageVerificationService } from './page-verification.service';

@Module({
  controllers: [PageVerificationController],
  providers: [PageVerificationService, PageVerificationSchedulerService],
  exports: [PageVerificationService, PageVerificationSchedulerService],
})
export class PageVerificationModule {}
