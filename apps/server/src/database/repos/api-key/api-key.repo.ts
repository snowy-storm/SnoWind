import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { dbOrTx } from '@snowind/db/utils';
import {
  ApiKey,
  InsertableApiKey,
  UpdatableApiKey,
} from '@snowind/db/types/entity.types';
import { PaginationOptions } from '@snowind/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@snowind/db/pagination/cursor-pagination';
import { ExpressionBuilder } from 'kysely';
import { DB } from '@snowind/db/types/db';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

@Injectable()
export class ApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof ApiKey> = [
    'id',
    'name',
    'creatorId',
    'workspaceId',
    'lastUsedAt',
    'expiresAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    id: string,
    opts?: { trx?: KyselyTransaction; includeDeleted?: boolean },
  ): Promise<ApiKey> {
    const db = dbOrTx(this.db, opts?.trx);
    let query = db
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .where('id', '=', id);

    if (!opts?.includeDeleted) {
      query = query.where('deletedAt', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async findByUserId(
    userId: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<ApiKey[]> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .where('creatorId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async insertApiKey(
    insertable: InsertableApiKey,
    opts?: { trx?: KyselyTransaction },
  ): Promise<ApiKey> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .insertInto('apiKeys')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateApiKey(
    id: string,
    data: UpdatableApiKey,
    opts?: { trx?: KyselyTransaction },
  ): Promise<ApiKey> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .updateTable('apiKeys')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async deleteById(
    id: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async findByTokenHash(
    hash: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<ApiKey | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .where('id', '=', hash)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async getApiKeysPaginated(opts: {
    workspaceId: string;
    creatorId?: string;
    pagination: PaginationOptions;
  }) {
    let query = this.db
      .selectFrom('apiKeys')
      .select(this.baseFields)
      .select((eb) => this.withCreator(eb))
      .where('workspaceId', '=', opts.workspaceId)
      .where('deletedAt', 'is', null);

    if (opts.creatorId) {
      query = query.where('creatorId', '=', opts.creatorId);
    }

    if (opts.pagination.query) {
      query = query.where('name', 'ilike', `%${opts.pagination.query}%`);
    }

    return executeWithCursorPagination(query, {
      perPage: opts.pagination.limit,
      cursor: opts.pagination.cursor,
      beforeCursor: opts.pagination.beforeCursor,
      fields: [
        { expression: 'createdAt', direction: 'desc' },
        { expression: 'id', direction: 'desc' },
      ],
      parseCursor: (cursor) => ({
        createdAt: new Date(cursor.createdAt),
        id: cursor.id,
      }),
    });
  }

  withCreator(eb: ExpressionBuilder<DB, 'apiKeys'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'apiKeys.creatorId'),
    ).as('creator');
  }
}
