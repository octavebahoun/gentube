import { sql } from 'drizzle-orm';
import { client, db } from './drizzle';

/**
 * Empties every application table and restarts the id sequences.
 * Destructive — meant for local development and tests only.
 */
export async function resetDatabase() {
  const rows = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'
  `);

  const tables = rows.map((row) => `"public"."${row.tablename}"`);
  if (tables.length === 0) return;

  await db.execute(
    sql.raw(`truncate table ${tables.join(', ')} restart identity cascade`)
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database in production.');
  }
  await resetDatabase();
  console.log('Database emptied.');
}

if (process.argv[1]?.endsWith('reset.ts')) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await client.end();
      process.exit(0);
    });
}
