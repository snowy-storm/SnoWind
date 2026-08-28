import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@snowind/db/types/kysely.types';
import { dbOrTx } from '@snowind/db/utils';
import {
  InsertableUserMFA,
  UpdatableUserMFA,
  UserMFA,
} from '@snowind/db/types/entity.types';

@Injectable()
export class UserMfaRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof UserMFA> = [
    'id',
    'userId',
    'workspaceId',
    'method',
    'secret',
    'backupCodes',
    'isEnabled',
    'createdAt',
    'updatedAt',
  ];

  async findByUserId(
    userId: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<UserMFA> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .selectFrom('userMfa')
      .select(this.baseFields)
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async upsertUserMfa(
    insertable: InsertableUserMFA,
    opts?: { trx?: KyselyTransaction },
  ): Promise<UserMFA> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .insertInto('userMfa')
      .values(insertable)
      .onConflict((oc) =>
        oc.column('userId').doUpdateSet({
          ...insertable,
          updatedAt: new Date(),
        }),
      )
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateUserMfa(
    id: string,
    updateable: UpdatableUserMFA,
    opts?: { trx?: KyselyTransaction },
  ): Promise<UserMFA> {
    const db = dbOrTx(this.db, opts?.trx);
    return db
      .updateTable('userMfa')
      .set({ ...updateable, updatedAt: new Date() })
      .where('id', '=', id)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async deleteByUserId(
    userId: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<void> {
    const db = dbOrTx(this.db, opts?.trx);
    await db
      .deleteFrom('userMfa')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
