// @ts-nocheck
import { Global, Module } from '@nestjs/common';
import { LicenseService } from './licence/license.service';
import { MfaService } from './mfa/services/mfa.service';
import { ApiKeyService } from './api-key/api-key.service';
import { OAuthStrategyService } from './oauth/services/oauth-strategy.service';
import { OAuthAuthorizationService } from './oauth/oauth-authorization.service';
import { SsoService } from './sso/sso.service';
import { AuditModule } from './audit/audit.module';
import { TypesenseModule } from './typesense/typesense.module';
import { DocxImportService } from './document-import/docx-import.service';
import { PdfImportService } from './document-import/pdf-import.service';
import { DocxExportService } from './document-export/docx-export.service';
import { ConfluenceImportService } from './confluence-import/confluence-import.service';
import { PdfExportService } from './pdf-export/pdf-export.service';
import { AttachmentEeService } from './attachments-ee/attachment-ee.service';
import { BaseWsService } from './base/realtime/base-ws.service';
import { BaseService } from './base/base.service';
import { BasesController } from './base/bases.controller';
import { AiService } from './ai/ai.service';
import { AiChatService } from './ai-chat/ai-chat.service';
import { TokenModule } from '../core/auth/token.module';
import { StorageModule } from '../integrations/storage/storage.module';
import { EnvironmentModule } from '../integrations/environment/environment.module';
import { CollaborationModule } from '../collaboration/collaboration.module';

@Global()
@Module({
  imports: [
    TokenModule,
    StorageModule,
    EnvironmentModule,
    CollaborationModule,
    TypesenseModule,
    AuditModule,
  ],
  controllers: [BasesController],
  providers: [
    LicenseService,
    MfaService,
    ApiKeyService,
    OAuthStrategyService,
    OAuthAuthorizationService,
    SsoService,
    DocxImportService,
    PdfImportService,
    DocxExportService,
    ConfluenceImportService,
    PdfExportService,
    AttachmentEeService,
    BaseWsService,
    BaseService,
    AiService,
    AiChatService,
  ],
  exports: [
    LicenseService,
    MfaService,
    ApiKeyService,
    OAuthStrategyService,
    OAuthAuthorizationService,
    SsoService,
    AuditModule,
    TypesenseModule,
    DocxImportService,
    PdfImportService,
    DocxExportService,
    ConfluenceImportService,
    PdfExportService,
    AttachmentEeService,
    BaseWsService,
    BaseService,
    AiService,
    AiChatService,
  ],
})
export class EeModule {}
