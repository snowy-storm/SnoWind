// @ts-nocheck
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@snowind/db/types/kysely.types';
import {
  AiChat,
  AiChatMessage,
  InsertableAiChat,
  InsertableAiChatMessage,
} from '@snowind/db/types/entity.types';
import { AiService } from '../ai/ai.service';
import { executeTx } from '@snowind/db/utils';
import { nanoid } from 'nanoid';

@Injectable()
export class AiChatService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiService: AiService,
  ) {}

  async listChats(
    userId: string,
    workspaceId: string,
  ): Promise<AiChat[]> {
    return this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('creatorId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .execute();
  }

  async createChat(
    userId: string,
    workspaceId: string,
    title?: string,
  ): Promise<AiChat> {
    const insert: InsertableAiChat = {
      id: nanoid(),
      workspaceId,
      creatorId: userId,
      title: title || null,
    };

    const [chat] = await this.db
      .insertInto('aiChats')
      .values(insert)
      .returningAll()
      .execute();

    return chat;
  }

  async sendMessage(
    chatId: string,
    userId: string,
    workspaceId: string,
    userMessage: string,
    opts: { useWorkspaceKnowledge?: boolean } = {},
  ): Promise<AsyncIterable<string>> {
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.creatorId !== userId) {
      throw new UnauthorizedException('Not authorized for this chat');
    }

    let systemPrompt: string | undefined;
    let finalPrompt = userMessage;

    if (opts.useWorkspaceKnowledge) {
      const similarPages = await this.aiService.searchSimilarPages(
        userMessage,
        workspaceId,
        10,
      );

      if (similarPages.length > 0) {
        const pageIds = similarPages.map((p) => p.pageId);

        const pages = await this.db
          .selectFrom('pages')
          .select(['id', 'title', 'textContent'])
          .where('id', 'in', pageIds)
          .where('deletedAt', 'is', null)
          .execute();

        const pageMap = new Map(pages.map((p) => [p.id, p]));

        const contextChunks: string[] = [];
        for (const similar of similarPages) {
          const page = pageMap.get(similar.pageId);
          if (page && page.textContent) {
            const snippet = page.textContent.slice(0, 2000);
            contextChunks.push(
              `[${page.title || 'Untitled'}] (relevance: ${similar.score.toFixed(3)})\n${snippet}`,
            );
          }
        }

        if (contextChunks.length > 0) {
          systemPrompt =
            'You are a helpful assistant with access to the user workspace knowledge. ' +
            'Use the following retrieved context chunks to answer the question when relevant. ' +
            'Cite the page titles in your response if you draw from them.\n\n' +
            'Retrieved context:\n' +
            contextChunks.join('\n\n---\n\n');
        }
      }
    }

    await executeTx(this.db, async (trx) => {
      const userMsgInsert: InsertableAiChatMessage = {
        id: nanoid(),
        chatId,
        workspaceId,
        userId,
        role: 'user',
        content: userMessage,
      };
      await trx
        .insertInto('aiChatMessages')
        .values(userMsgInsert)
        .execute();

      if (!chat.title && userMessage.trim().length > 0) {
        const autoTitle = userMessage.trim().slice(0, 100);
        await trx
          .updateTable('aiChats')
          .set({ title: autoTitle, updatedAt: new Date() })
          .where('id', '=', chatId)
          .execute();
      }
    });

    const stream = await this.aiService.generateCompletion({
      prompt: finalPrompt,
      system: systemPrompt,
      workspaceId,
      userId,
    });

    this.saveAssistantMessageAsync(
      chatId,
      workspaceId,
      stream,
    ).catch((err) => {
      console.error('Failed to save assistant message', err);
    });

    return stream;
  }

  private async saveAssistantMessageAsync(
    chatId: string,
    workspaceId: string,
    stream: AsyncIterable<string>,
  ): Promise<void> {
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const fullContent = chunks.join('');

    const insert: InsertableAiChatMessage = {
      id: nanoid(),
      chatId,
      workspaceId,
      userId: null,
      role: 'assistant',
      content: fullContent,
    };

    await this.db
      .insertInto('aiChatMessages')
      .values(insert)
      .execute();

    await this.db
      .updateTable('aiChats')
      .set({ updatedAt: new Date() })
      .where('id', '=', chatId)
      .execute();
  }

  async listMessages(
    chatId: string,
    userId: string,
    workspaceId: string,
  ): Promise<AiChatMessage[]> {
    const chat = await this.db
      .selectFrom('aiChats')
      .select(['id', 'creatorId'])
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.creatorId !== userId) {
      throw new UnauthorizedException('Not authorized for this chat');
    }

    return this.db
      .selectFrom('aiChatMessages')
      .select([
        'id',
        'chatId',
        'workspaceId',
        'userId',
        'role',
        'content',
        'toolCalls',
        'metadata',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ])
      .where('chatId', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }
}
