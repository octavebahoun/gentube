import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import 'dotenv/config';
import { createAssetStore } from '@/lib/storage';
import { parseCatalogue } from './import-catalog';

/**
 * Téléverse la bibliothèque de sons vers R2.
 *
 *   pnpm tsx lib/sounds/upload-catalogue.ts assets/sounds/CATALOG.md
 *   pnpm tsx lib/sounds/upload-catalogue.ts assets/sounds/CATALOG.md --dry-run
 *
 * Les clés ne sont pas inventées ici : ce sont exactement celles que le
 * `CATALOG.md` annonce dans sa colonne `src`, et que le storyboard recopie
 * verbatim. Une clé bricolée autrement donnerait un son introuvable au rendu.
 *
 * **Pas de préfixe tenant.** La bibliothèque est partagée entre tous les
 * projets et survit à l'archivage (`assets/sounds/README.md`) ; elle ne passe
 * donc pas par `assetKey()`, qui préfixe par le tenant.
 *
 * Idempotent : R2 écrase un objet de même clé. Relancer après avoir ajouté un
 * son ne coûte que ce son — les autres sont réécrits à l'identique.
 */

const TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

async function main() {
  const source = process.argv[2];
  if (!source) {
    throw new Error(
      'Usage: tsx lib/sounds/upload-catalogue.ts <CATALOG.md> [--dry-run]'
    );
  }
  const essai = process.argv.includes('--dry-run');
  const racine = resolve(source, '..');

  const rows = parseCatalogue(await readFile(source, 'utf8'));
  if (rows.length === 0) throw new Error(`Aucun son listé dans ${source}.`);

  // Tout vérifier avant d'écrire quoi que ce soit : un téléversement à moitié
  // fait laisse un catalogue qui promet des sons absents.
  const absents = rows.filter(
    (row) => !existsSync(join(racine, row.key.replace(/^sounds\//, '')))
  );
  if (absents.length > 0) {
    throw new Error(
      `${absents.length} son(s) du catalogue manquent sur le disque :\n` +
        absents.map((r) => `  ${r.key}`).join('\n')
    );
  }

  const poids = rows.reduce(
    (total, row) =>
      total + statSync(join(racine, row.key.replace(/^sounds\//, ''))).size,
    0
  );
  console.log(
    `${rows.length} sons · ${(poids / 1e6).toFixed(1)} Mo` +
      (essai ? ' · essai à blanc, rien ne sera écrit' : '')
  );

  if (essai) {
    for (const row of rows.slice(0, 5)) console.log(`  ${row.key}`);
    console.log(`  … et ${rows.length - 5} autres`);
    return;
  }

  const store = createAssetStore();
  let fait = 0;

  for (const row of rows) {
    const chemin = join(racine, row.key.replace(/^sounds\//, ''));
    const extension = row.key.slice(row.key.lastIndexOf('.')).toLowerCase();
    const type = TYPES[extension];
    if (!type) throw new Error(`Extension inconnue pour ${row.key}.`);

    await store.put(row.key, await readFile(chemin), type);
    fait += 1;
    if (fait % 10 === 0 || fait === rows.length) {
      console.log(`  ${fait}/${rows.length}`);
    }
  }

  console.log(`\n${fait} sons sur R2, sous les clés du catalogue.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
