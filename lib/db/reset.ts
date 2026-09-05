import { sql } from 'drizzle-orm';
import { client, db } from './drizzle';

/** Hôtes que l'on accepte de vider. Tout le reste est quelqu'un d'autre. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Refuse de vider une base qui n'est pas sur cette machine.
 *
 * **Le 5 septembre 2026, cette fonction a vidé la base Supabase de
 * production.** Deux causes, et il fallait les deux : un fichier de sonde
 * nommé `probe-reset.ts` a déclenché l'auto-exécution du bas de ce fichier —
 * qui ne testait que `endsWith('reset.ts')` — et l'affectation
 * `process.env.DATABASE_URL = TEST_DATABASE_URL` de la sonde arrivait après
 * l'import de `./drizzle`, que les modules ESM hissent toujours.
 *
 * Aucun appelant légitime ne vide une base distante. La garde est donc ici, au
 * plus près du `truncate`, et pas dans les appelants : c'est le seul endroit
 * qu'on ne peut pas contourner par distraction.
 */
function assertLocalTarget(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to empty ${host}: resetDatabase() only ever runs against a ` +
        'database on this machine. If you really mean to wipe a remote ' +
        'database, do it from that provider\'s console, where it asks you ' +
        'to confirm.'
    );
  }
}

/**
 * Empties every application table and restarts the id sequences.
 * Destructive — meant for local development and tests only.
 */
export async function resetDatabase() {
  assertLocalTarget();

  /*
   * `order by tablename` n'est pas cosmétique.
   *
   * `truncate` prend un verrou exclusif sur chaque table **dans l'ordre où
   * elles sont écrites**, et sur les tables que des clés étrangères y
   * rattachent. Sans tri, `pg_tables` rend l'ordre physique, qui diffère d'une
   * session à l'autre : deux suites de tests qui se vident en même temps
   * verrouillent dans deux ordres différents, et c'est la définition d'un
   * interblocage. Il s'est produit le 5 septembre 2026, le jour où une table
   * de plus est entrée dans le graphe des clés étrangères.
   *
   * Un ordre stable ne supprime pas l'attente — il supprime le cycle.
   */
  const rows = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'
    order by tablename
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

// `endsWith` attrapait `probe-reset.ts`, `db-reset.ts`, n'importe quoi. On
// compare le nom de fichier entier.
if (process.argv[1]?.split('/').pop() === 'reset.ts') {
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
