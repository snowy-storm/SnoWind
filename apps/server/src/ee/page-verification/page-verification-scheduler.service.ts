import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql, SqlBool } from 'kysely';
import { Queue } from 'bullmq';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { EXPIRING_WINDOW_MS } from './page-verification.constants';

@Injectable()
export class PageVerificationSchedulerService {
  private readonly logger = new Logger(PageVerificationSchedulerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  @Interval('verification-reconcile', 15 * 60 * 1000)
  async handleInterval(): Promise<void> {
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_MS);

    try {
      const expiring = await this.db
        .selectFrom('pageVerifications')
        .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
        .innerJoin(
          'workspaces',
          'workspaces.id',
          'pageVerifications.workspaceId',
        )
        .select(['pageVerifications.id', 'pageVerifications.expiresAt'])
        .where('pageVerifications.type', '=', 'expiring')
        .where('pageVerifications.expiresAt', 'is not', null)
        .where('pageVerifications.expiresAt', '>', now)
        .where('pageVerifications.expiresAt', '<=', windowEnd)
        .where('pages.deletedAt', 'is', null)
        .where(
          sql<SqlBool>`(workspaces.settings->'pageVerification'->>'enabled') is distinct from 'false'`,
        )
        .execute();

      for (const row of expiring) {
        await this.enqueueOnce(
          QueueJob.PAGE_VERIFICATION_EXPIRING,
          row.id,
          'expiring',
          row.expiresAt,
        );
      }

      const expired = await this.db
        .selectFrom('pageVerifications')
        .innerJoin('pages', 'pages.id', 'pageVerifications.pageId')
        .innerJoin(
          'workspaces',
          'workspaces.id',
          'pageVerifications.workspaceId',
        )
        .select(['pageVerifications.id', 'pageVerifications.expiresAt'])
        .where('pageVerifications.type', '=', 'expiring')
        .where('pageVerifications.expiresAt', 'is not', null)
        .where('pageVerifications.expiresAt', '<=', now)
        .where('pages.deletedAt', 'is', null)
        .where(
          sql<SqlBool>`(workspaces.settings->'pageVerification'->>'enabled') is distinct from 'false'`,
        )
        .execute();

      for (const row of expired) {
        await this.enqueueOnce(
          QueueJob.PAGE_VERIFICATION_EXPIRED,
          row.id,
          'expired',
          row.expiresAt,
        );
      }

      if (expiring.length > 0 || expired.length > 0) {
        this.logger.debug(
          `Verification reconcile enqueued ${expiring.length} expiring and ${expired.length} expired jobs`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Verification reconcile failed: ${message}`);
    }
  }

  private async enqueueOnce(
    name: QueueJob,
    verificationId: string,
    kind: 'expiring' | 'expired',
    expiresAt: Date | string | null,
  ): Promise<void> {
    const stamp = expiresAt ? new Date(expiresAt).getTime() : 0;
    try {
      await this.notificationQueue.add(
        name,
        { verificationId },
        {
          jobId: `page-verification-${kind}-${verificationId}-${stamp}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.toLowerCase().includes('already')) {
        throw err;
      }
    }
  }
}
