import { readFile } from 'node:fs/promises';
import { client, db } from '@/lib/db/drizzle';
import { soundAssets, type NewSoundAsset, type SoundKind } from '@/lib/db/schema';

/**
 * Importe un catalogue de sons généré dans `sound_assets`.
 *
 *   pnpm tsx lib/sounds/import-catalog.ts ../pipevideo/public/sounds/CATALOG.md
 *
 * La source est la table markdown produite par le pipeline pipevideo
 * (`npm run sounds`), dont les colonnes sont :
 *   name | kind | mood | loopable | duration | key | bpm | impacts | usage | src
 *
 * Seules les métadonnées sont importées. Les fichiers audio eux-mêmes doivent
 * atteindre R2 sous les mêmes clés avant qu'un rendu puisse les résoudre —
 * importer les lignes ne rend pas les sons disponibles, il les rend
 * *choisisables* par le modèle.
 */

const KINDS = new Set<SoundKind>(['sfx', 'ambient', 'music']);

function cell(value: string): string | null {
  const trimmed = value.trim().replace(/^`|`$/g, '').trim();
  return trimmed === '' || trimmed === '-' ? null : trimmed;
}

function seconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/s$/i, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function impacts(value: string | null): number[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((part) => Number.parseFloat(part.trim()))
    .filter((part) => Number.isFinite(part));
}

export function parseCatalogue(markdown: string): NewSoundAsset[] {
  const rows: NewSoundAsset[] = [];

  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const columns = line.split('|').slice(1, -1);
    if (columns.length < 10) continue;

    const name = cell(columns[0]);
    const kind = cell(columns[1]);
    const src = cell(columns[9]);

    // Saute la ligne d'en-tête et le séparateur sans cas particulier.
    if (!name || !src || !kind || !KINDS.has(kind as SoundKind)) continue;

    rows.push({
      key: src,
      name,
      kind: kind as SoundKind,
      mood: cell(columns[2]),
      loopable: cell(columns[3]) === 'true',
      durationS: seconds(cell(columns[4])),
      musicalKey: cell(columns[5]),
      bpm: cell(columns[6]) ? Number.parseInt(cell(columns[6])!, 10) : null,
      impacts: impacts(cell(columns[7])),
      usage: cell(columns[8]),
    });
  }

  return rows;
}

async function main() {
  const source = process.argv[2];
  if (!source) {
    throw new Error('Usage: tsx lib/sounds/import-catalog.ts <CATALOG.md>');
  }

  const parsed = parseCatalogue(await readFile(source, 'utf8'));
  if (parsed.length === 0) {
    throw new Error(`No sound row found in ${source}.`);
  }

  for (const row of parsed) {
    await db
      .insert(soundAssets)
      .values(row)
      .onConflictDoUpdate({ target: soundAssets.key, set: { ...row, updatedAt: new Date() } });
  }

  const byKind = parsed.reduce<Record<string, number>>((counts, row) => {
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`Imported ${parsed.length} sounds from ${source}`);
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log(
    '\nThe audio files still have to exist on R2 under these same keys.'
  );
}

if (process.argv[1]?.endsWith('import-catalog.ts')) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    })
    .finally(async () => {
      await client.end();
      process.exit(0);
    });
}
