import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('drawing_type', 'varchar', (col) => col.ifNotExists())
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_drawing_type
      ON pages (space_id, position COLLATE "C")
      WHERE drawing_type IS NOT NULL AND deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pages_drawing_type`.execute(db);
  await db.schema.alterTable('pages').dropColumn('drawing_type').execute();
}
