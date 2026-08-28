import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE users
    SET locale = 'zh-CN'
    WHERE locale IS NULL OR locale = 'en-US' OR locale = 'en'
  `.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Irreversible: cannot distinguish migrated users from those who chose zh-CN.
}
