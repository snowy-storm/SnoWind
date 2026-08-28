import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Client } from 'typesense';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { TYPESENSE_CLIENT } from './typesense.constants';
import { parseTypesenseUrl } from './typesense.utils';
import { TypesenseCollectionService } from './services/typesense-collection.service';
import { TypesenseIndexerService } from './services/typesense-indexer.service';
import { PageSearchService } from './services/page-search.service';
import { SearchQueueProcessor } from './processors/search-queue.processor';

@Injectable()
class TypesenseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseBootstrapService.name);

  constructor(
    private readonly indexer: TypesenseIndexerService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.environmentService.getSearchDriver() !== 'typesense') {
      return;
    }

    try {
      await this.indexer.reindexIfEmpty();
    } catch (err) {
      this.logger.warn(
        `Typesense startup indexing skipped: ${err?.['message'] || err}`,
      );
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: TYPESENSE_CLIENT,
      useFactory: (environmentService: EnvironmentService): Client | null => {
        if (environmentService.getSearchDriver() !== 'typesense') {
          return null;
        }

        const node = parseTypesenseUrl(environmentService.getTypesenseUrl());
        return new Client({
          nodes: [node],
          apiKey: environmentService.getTypesenseApiKey(),
          connectionTimeoutSeconds: 10,
          retryIntervalSeconds: 1,
        });
      },
      inject: [EnvironmentService],
    },
    TypesenseCollectionService,
    TypesenseIndexerService,
    PageSearchService,
    SearchQueueProcessor,
    TypesenseBootstrapService,
  ],
  exports: [PageSearchService, TypesenseIndexerService, TYPESENSE_CLIENT],
})
export class TypesenseModule {}
