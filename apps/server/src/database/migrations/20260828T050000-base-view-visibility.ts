import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('base_views')
    .addColumn('is_private', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  await db.schema
    .alterTable('base_views')
    .addColumn('is_default', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

  // Pin the earliest table view on each base as the shared default tab.
  await sql`
    UPDATE base_views AS v
    SET is_default = true
    WHERE v.id IN (
      SELECT DISTINCT ON (page_id) id
      FROM base_views
      WHERE type = 'table'
      ORDER BY page_id, position COLLATE "C", id
    )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('base_views').dropColumn('is_default').execute();
  await db.schema.alterTable('base_views').dropColumn('is_private').execute();
}
