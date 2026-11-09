import { type Kysely, sql } from 'kysely';

/**
 * Word export styles were stored as a JSON string inside jsonb, so the
 * saved config failed to parse and export fell back to the built-in style.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE spaces
    SET settings = jsonb_set(
      settings,
      '{wordExport}',
      (settings->>'wordExport')::jsonb
    )
    WHERE settings ? 'wordExport'
      AND jsonb_typeof(settings->'wordExport') = 'string'
  `.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Leaving the object form is safe. The previous string form was a write bug.
}
