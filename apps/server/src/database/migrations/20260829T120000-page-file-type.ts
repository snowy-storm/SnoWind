import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('file_type', 'varchar', (col) => col.ifNotExists())
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_file_type
      ON pages (space_id, position COLLATE "C")
      WHERE file_type IS NOT NULL AND deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pages_file_type`.execute(db);
  await db.schema.alterTable('pages').dropColumn('file_type').execute();
}
