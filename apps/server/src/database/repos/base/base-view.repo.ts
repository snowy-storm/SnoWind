import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { dbOrTx } from '@snowind/db/utils';
import {
  BaseView,
  InsertableBaseView,
  UpdatableBaseView,
} from '@snowind/db/types/entity.types';
import { sql } from 'kysely';

@Injectable()
export class BaseViewRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof BaseView> = [
    'id',
    'pageId',
    'name',
    'type',
    'position',
    'config',
    'workspaceId',
    'creatorId',
    'isPrivate',
    'isDefault',
    'createdAt',
    'updatedAt',
  ];

  async findById(
    id: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseView | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('baseViews')
      .select(this.baseFields)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findByPageId(
    pageId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseView[]> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('baseViews')
      .select(this.baseFields)
      .where('pageId', '=', pageId)
      .orderBy(sql`position COLLATE "C"`, 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async insertView(
    insertable: InsertableBaseView,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseView> {
    const db = dbOrTx(this.db, opts?.trx);
    const clean: any = {};
    for (const k of Object.keys(insertable)) {
      const v = (insertable as any)[k];
      clean[k] = v === undefined ? null : v;
    }
    return db
      .insertInto('baseViews')
      .values(clean)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateView(
    id: string,
    pageId: string,
    data: UpdatableBaseView,
    opts?: { trx?: KyselyTransaction },
  ): Promise<BaseView | undefined> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .updateTable('baseViews')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', id)
      .where('pageId', '=', pageId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async deleteView(
    id: string,
    pageId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .deleteFrom('baseViews')
      .where('id', '=', id)
      .where('pageId', '=', pageId)
      .execute();
  }
}
