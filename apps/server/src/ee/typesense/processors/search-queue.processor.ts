import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';

@Processor(QueueName.SEARCH_QUEUE)
export class SearchQueueProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(SearchQueueProcessor.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly indexer: TypesenseIndexerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (this.environmentService.getSearchDriver() !== 'typesense') {
      return;
    }

    const pageIds: string[] = job.data?.pageIds ?? [];

    switch (job.name) {
      case QueueJob.PAGE_CREATED:
      case QueueJob.PAGE_UPDATED:
      case QueueJob.PAGE_RESTORED:
      case QueueJob.PAGE_CONTENT_UPDATED:
      case QueueJob.SEARCH_INDEX_PAGE:
      case QueueJob.SEARCH_INDEX_PAGES:
        if (pageIds.length > 0) {
          await this.indexer.indexPages(pageIds);
        } else if (job.name === QueueJob.SEARCH_INDEX_PAGES) {
          await this.indexer.reindexAllPages();
        }
        break;

      case QueueJob.PAGE_DELETED:
      case QueueJob.PAGE_SOFT_DELETED:
      case QueueJob.SEARCH_REMOVE_PAGE:
        await this.indexer.removePages(pageIds);
        break;

      case QueueJob.SPACE_DELETED:
        if (job.data?.spaceId) {
          await this.indexer.removeBySpace(job.data.spaceId);
        }
        break;

      case QueueJob.WORKSPACE_DELETED:
        if (job.data?.workspaceId) {
          await this.indexer.removeByWorkspace(job.data.workspaceId);
        }
        break;

      case QueueJob.TYPESENSE_FLUSH:
        await this.indexer.reindexAllPages();
        break;

      default:
        break;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing ${job.name} search job`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.error(
      `Error processing ${job.name} search job. Reason: ${job.failedReason}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Completed ${job.name} search job`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
