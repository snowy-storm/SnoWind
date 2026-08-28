// @ts-nocheck
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import { LanguageModel, streamText, embed, EmbeddingModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { openaiCompatible } from '@ai-sdk/openai-compatible';
import { TurbopufferVectorStore } from '@turbopuffer/turbopuffer';

function getOllamaProvider(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('ai-sdk-ollama') || require('ollama-ai-provider');
    return mod.ollama;
  } catch {
    return undefined;
  }
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private turbopufferClient: TurbopufferVectorStore | null = null;

  constructor(
    private readonly environmentService: EnvironmentService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private getTurbopufferClient(): TurbopufferVectorStore | null {
    if (this.turbopufferClient) {
      return this.turbopufferClient;
    }

    const apiKey = this.environmentService.getTurbopufferApiKey();
    if (!apiKey) {
      return null;
    }

    try {
      this.turbopufferClient = new TurbopufferVectorStore({
        apiKey,
        baseUrl: this.environmentService.getTurbopufferBaseUrl() || undefined,
        region: this.environmentService.getTurbopufferRegion() || undefined,
      });
      return this.turbopufferClient;
    } catch (err) {
      this.logger.warn('Failed to initialize Turbopuffer client', err);
      return null;
    }
  }

  getChatModel(): LanguageModel {
    const driver = this.environmentService.getAiDriver()?.toLowerCase();
    const completionModel =
      this.environmentService.getAiChatModel() ||
      this.environmentService.getAiCompletionModel();

    if (!driver || !completionModel) {
      throw new NotImplementedException('AI is not configured');
    }

    switch (driver) {
      case 'openai': {
        const apiKey = this.environmentService.getOpenAiApiKey();
        const baseURL = this.environmentService.getOpenAiApiUrl();
        return openai(completionModel, {
          apiKey: apiKey || undefined,
          baseURL: baseURL || undefined,
        });
      }
      case 'google': {
        const apiKey = this.environmentService.getGeminiApiKey();
        return google(completionModel, {
          apiKey: apiKey || undefined,
        });
      }
      case 'ollama': {
        const baseURL = this.environmentService.getOllamaApiUrl();
        const ollama = getOllamaProvider();
        if (!ollama) throw new NotImplementedException('Ollama provider not available');
        return ollama(completionModel, {
          baseURL,
        });
      }
      case 'openai-compatible': {
        const apiKey = this.environmentService.getOpenAiApiKey();
        const baseURL = this.environmentService.getOpenAiApiUrl();
        return openaiCompatible(completionModel, {
          apiKey: apiKey || undefined,
          baseURL: baseURL || undefined,
        });
      }
      default:
        throw new NotImplementedException(`Unsupported AI driver: ${driver}`);
    }
  }

  getEmbeddingModel(): EmbeddingModel<string> {
    const driver = this.environmentService.getAiDriver()?.toLowerCase();
    const embeddingModel = this.environmentService.getAiEmbeddingModel();

    if (!driver || !embeddingModel) {
      throw new NotImplementedException('AI embeddings are not configured');
    }

    switch (driver) {
      case 'openai': {
        const apiKey = this.environmentService.getOpenAiApiKey();
        const baseURL = this.environmentService.getOpenAiApiUrl();
        return openai.embedding(embeddingModel, {
          apiKey: apiKey || undefined,
          baseURL: baseURL || undefined,
        });
      }
      case 'google': {
        const apiKey = this.environmentService.getGeminiApiKey();
        return google.embedding(embeddingModel, {
          apiKey: apiKey || undefined,
        });
      }
      case 'ollama': {
        const baseURL = this.environmentService.getOllamaApiUrl();
        const ollama = getOllamaProvider();
        if (!ollama) throw new NotImplementedException('Ollama provider not available');
        return ollama.embedding(embeddingModel, {
          baseURL,
        });
      }
      case 'openai-compatible': {
        const apiKey = this.environmentService.getOpenAiApiKey();
        const baseURL = this.environmentService.getOpenAiApiUrl();
        return openaiCompatible.embedding(embeddingModel, {
          apiKey: apiKey || undefined,
          baseURL: baseURL || undefined,
        });
      }
      default:
        throw new NotImplementedException(
          `Unsupported AI embedding driver: ${driver}`,
        );
    }
  }

  async generateCompletion(opts: {
    prompt: string;
    system?: string;
    workspaceId: string;
    userId: string;
  }): Promise<AsyncIterable<string>> {
    const model = this.getChatModel();

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system });
    }
    messages.push({ role: 'user', content: opts.prompt });

    const result = streamText({
      model,
      messages,
    });

    return result.textStream;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const model = this.getEmbeddingModel();
    const { embeddings } = await embed({
      model,
      values: texts,
    });
    return embeddings;
  }

  async searchSimilarPages(
    query: string,
    workspaceId: string,
    topK = 10,
  ): Promise<Array<{ pageId: string; spaceId: string; score: number }>> {
    const vectorDriver = this.environmentService.getAiVectorDriver();

    if (vectorDriver === 'turbopuffer') {
      return this.searchSimilarPagesTurbopuffer(query, workspaceId, topK);
    }

    return this.searchSimilarPagesPgvector(query, workspaceId, topK);
  }

  private async searchSimilarPagesPgvector(
    query: string,
    workspaceId: string,
    topK: number,
  ): Promise<Array<{ pageId: string; spaceId: string; score: number }>> {
    const [queryEmbedding] = await this.embedTexts([query]);

    const results = await this.db
      .selectFrom('pageEmbeddings')
      .select(['pageId', 'spaceId'])
      .select((eb) =>
        eb
          .raw('1 - (embedding <=> ?::vector)', [
            JSON.stringify(queryEmbedding),
          ])
          .as('score'),
      )
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('score', 'desc')
      .limit(topK)
      .execute();

    const seen = new Set<string>();
    const deduped: Array<{ pageId: string; spaceId: string; score: number }> =
      [];

    for (const row of results) {
      if (!seen.has(row.pageId)) {
        seen.add(row.pageId);
        deduped.push({
          pageId: row.pageId,
          spaceId: row.spaceId,
          score: Number(row.score) || 0,
        });
      }
    }

    return deduped;
  }

  private async searchSimilarPagesTurbopuffer(
    query: string,
    workspaceId: string,
    topK: number,
  ): Promise<Array<{ pageId: string; spaceId: string; score: number }>> {
    const client = this.getTurbopufferClient();
    if (!client) {
      this.logger.warn(
        'Turbopuffer client not initialized, falling back to pgvector',
      );
      return this.searchSimilarPagesPgvector(query, workspaceId, topK);
    }

    const [queryEmbedding] = await this.embedTexts([query]);
    const namespacePrefix =
      this.environmentService.getTurbopufferNamespacePrefix() || 'snowind';
    const namespace = `${namespacePrefix}_${workspaceId}`;

    try {
      const searchResults = await client.query({
        namespace,
        vector: queryEmbedding,
        topK,
        includeAttributes: ['pageId', 'spaceId'],
      });

      return searchResults.map((r) => ({
        pageId: String(r.attributes?.pageId || ''),
        spaceId: String(r.attributes?.spaceId || ''),
        score: Number(r.dist ?? 0),
      }));
    } catch (err) {
      this.logger.warn(
        'Turbopuffer search failed, falling back to pgvector',
        err,
      );
      return this.searchSimilarPagesPgvector(query, workspaceId, topK);
    }
  }
}
