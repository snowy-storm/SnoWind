import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from 'typesense';
import { ObjectNotFound } from 'typesense/lib/Typesense/Errors';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  TYPESENSE_CLIENT,
  TYPESENSE_PAGES_COLLECTION,
} from '../typesense.constants';
import { buildPageCollectionSchema } from '../typesense.utils';

@Injectable()
export class TypesenseCollectionService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseCollectionService.name);
  private ready = false;

  constructor(
    @Inject(TYPESENSE_CLIENT) private readonly client: Client | null,
    private readonly environmentService: EnvironmentService,
  ) {}

  isEnabled(): boolean {
    return (
      this.environmentService.getSearchDriver() === 'typesense' &&
      this.client != null
    );
  }

  isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await this.ensureCollection();
  }

  async ensureCollection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const locale = this.environmentService.getTypesenseLocale();
    const desired = buildPageCollectionSchema(locale);

    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const existing = await this.client
          .collections(TYPESENSE_PAGES_COLLECTION)
          .retrieve();
        const existingLocale = (
          existing as { metadata?: { locale?: string } }
        ).metadata?.locale;
        const titleField = existing.fields?.find((field) => field.name === 'title');
        const currentLocale = existingLocale || titleField?.locale;

        if (currentLocale && currentLocale !== locale) {
          this.logger.warn(
            `Typesense locale changed from ${currentLocale} to ${locale}; recreating collection`,
          );
          await this.client.collections(TYPESENSE_PAGES_COLLECTION).delete();
          await this.client.collections().create(desired);
        }

        this.ready = true;
        return true;
      } catch (err) {
        if (err instanceof ObjectNotFound) {
          await this.client.collections().create(desired);
          this.ready = true;
          this.logger.log(
            `Created Typesense collection ${TYPESENSE_PAGES_COLLECTION} (locale=${locale})`,
          );
          return true;
        }

        this.logger.warn(
          `Typesense not ready (attempt ${attempt}/8): ${err?.['message'] || err}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    this.logger.error('Failed to connect to Typesense after retries');
    return false;
  }
}
