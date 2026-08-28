import { Global, Module } from '@nestjs/common';
import { AUDIT_SERVICE } from '../../integrations/audit/audit.service';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: AUDIT_SERVICE,
      useExisting: AuditService,
    },
  ],
  exports: [AUDIT_SERVICE, AuditService],
})
export class AuditModule {}
