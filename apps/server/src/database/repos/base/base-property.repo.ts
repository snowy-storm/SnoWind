import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { dbOrTx } from '@snowind/db/utils';
import {
  BaseProperty,
  InsertableBaseProperty,
  UpdatableBaseProperty,
} from '@snowind/db/types/entity.types';
import { sql } from 'kysely';

@Injectable()
export class BasePropertyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof BaseProperty> = [
    'id',
    'pageId',
    'name',
    'type',
    'position',
    'typeOptions',
    'pendingType',
    'pendingTypeOptions',
    'pendingToken',
    'isPrimary',
    'schemaVersion',
    'workspaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    id: string,
    pageId: string,
    opts?: { trx?: KyselyTransaction; includeDeleted?: boolean },
  ): Promise<BaseProperty | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    let query = db
      .selectFrom('baseProperties')
      .select(this.baseFields)
      .where('id', '=', id)
      .where('pageId', '=', pageId);

    if (!opts?.includeDeleted) {
      query = query.where('deletedAt', 'is', null);
    }

    return query.executeTakeFirst();
  }

  async findByPageId(
    pageId: string,
    opts?: { trx?: KyselyTransaction; includeDeleted?: boolean },
  ): Promise<BaseProperty[]> {
    const db = dbOrTx(this.db, opts?.trx);
    let query = db
      .selectFrom('baseProperties')
      .select(this.baseFields)
      .where('pageId', '=', pageId);

    if (!opts?.includeDeleted) {
      query = query.where('deletedAt', 'is', null);
    }

    return query
      .orderBy(sql`position COLLATE "C"`, 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async findPrimary(
    pageId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseProperty | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('baseProperties')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .where('isPrimary', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy(sql`position COLLATE "C"`, 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async insertProperty(
    insertable: InsertableBaseProperty,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseProperty> {
    const db = dbOrTx(this.db, opts?.trx);
    const clean: any = {};
    for (const k of Object.keys(insertable)) {
      const v = (insertable as any)[k];
      clean[k] = v === undefined ? null : v;
    }
    return db
      .insertInto('baseProperties')
      .values(clean)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateProperty(
    id: string,
    pageId: string,
    data: UpdatableBaseProperty,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseProperty | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .updateTable('baseProperties')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDeleteProperty(
    id: string,
    pageId: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .updateTable('baseProperties')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }
}
