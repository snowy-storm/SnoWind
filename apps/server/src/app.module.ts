import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EnvironmentService } from './integrations/environment/environment.service';
import { AuditActorInterceptor } from './common/interceptors/audit-actor.interceptor';
import { CoreModule } from './core/core.module';
import { EnvironmentModule } from './integrations/environment/environment.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { WsModule } from './ws/ws.module';
import { DatabaseModule } from '@snowind/db/database.module';
import { StorageModule } from './integrations/storage/storage.module';
import { MailModule } from './integrations/mail/mail.module';
import { QueueModule } from './integrations/queue/queue.module';
import { StaticModule } from './integrations/static/static.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from './integrations/health/health.module';
import { ExportModule } from './integrations/export/export.module';
import { ImportModule } from './integrations/import/import.module';
import { SecurityModule } from './integrations/security/security.module';
import { TelemetryModule } from './integrations/telemetry/telemetry.module';
import { RedisModule } from '@nestjs-labs/nestjs-ioredis';
import { RedisConfigService } from './integrations/redis/redis-config.service';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis, { defaultReconnectStrategy } from '@keyv/redis';
import { parseRedisUrl } from './common/helpers';
import { LoggerModule } from './common/logger/logger.module';
import { ClsModule } from 'nestjs-cls';
import { ThrottleModule } from './integrations/throttle/throttle.module';
import { EncryptionModule } from './integrations/encryption/encryption.module';
import { BasesModule } from './ee/base/bases.module';
import { TemplatesModule } from './ee/template/templates.module';
import { TypesenseModule } from './ee/typesense/typesense.module';
import { ApiKeyModule } from './ee/api-key/api-key.module';
import { AuditModule } from './ee/audit/audit.module';
import { PagePermissionModule } from './ee/page-permission/page-permission.module';
import { PageVerificationModule } from './ee/page-verification/page-verification.module';
import { MfaModule } from './ee/mfa/mfa.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggerModule,
    AuditModule,
    CoreModule,
    DatabaseModule,
    EnvironmentModule,
    EncryptionModule,
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (environmentService: EnvironmentService) => {
        const redisUrl = environmentService.getRedisUrl();
        const { family, tls } = parseRedisUrl(redisUrl);

        return {
          ttl: 5 * 1000,
          stores: [
            new KeyvRedis({
              url: redisUrl,
              socket: {
                family,
                reconnectStrategy: defaultReconnectStrategy,
                ...tls,
              },
            }),
          ],
        };
      },
      inject: [EnvironmentService],
    }),
    CollaborationModule,
    WsModule,
    QueueModule,
    StaticModule,
    HealthModule,
    ImportModule,
    ExportModule,
    StorageModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    MailModule.forRootAsync({
      imports: [EnvironmentModule],
    }),
    EventEmitterModule.forRoot(),
    SecurityModule,
    TelemetryModule,
    ThrottleModule,
    BasesModule,
    TemplatesModule,
    TypesenseModule,
    ApiKeyModule,
    PagePermissionModule,
    PageVerificationModule,
    MfaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditActorInterceptor,
    },
  ],
})
export class AppModule {}
