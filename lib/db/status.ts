import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Dit ce qu'une base contient vraiment : combien des migrations du dépôt y sont
 * appliquées, et quelles tables existent. Écrit pour une base distante, où l'on
 * ne peut pas simplement ouvrir un `psql` — `drizzle-kit migrate` ne dit rien
 * quand il n'a rien à faire, ce qui ne se distingue pas d'un échec silencieux.
 *
 *   DATABASE_URL=... pnpm db:status
 *
 * Lecture seule : aucune écriture, aucun DDL.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  // Jamais l'URL entière : elle porte le mot de passe et cette sortie finit
  // collée dans une conversation.
  const { hostname, port, pathname } = new URL(url);
  console.log(`base    : ${hostname}:${port}${pathname}`);

  const journal = JSON.parse(
    readFileSync('./lib/db/migrations/meta/_journal.json', 'utf8')
  ) as { entries: { tag: string }[] };

  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 20 });
  try {
    const [{ present }] = await sql<{ present: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as present`;

    if (!present) {
      console.log(`migrations : 0 / ${journal.entries.length} — jamais migrée`);
    } else {
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from drizzle.__drizzle_migrations`;
      const missing = journal.entries.length - n;
      console.log(
        `migrations : ${n} / ${journal.entries.length}` +
          (missing > 0
            ? ` — il en manque ${missing}, dont ${journal.entries.at(-1)!.tag}`
            : ' — à jour')
      );
    }

    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`;
    console.log(`tables  : ${tables.length}`);
    for (const { table_name } of tables) console.log(`  ${table_name}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
