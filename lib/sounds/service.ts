import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { soundAssets, type SoundAsset, type SoundKind } from '@/lib/db/schema';

/**
 * The shared sound library.
 *
 * Read through `db` rather than `tenantDb()`: the table holds no tenant_id
 * because it belongs to no tenant. It is a catalogue of platform assets —
 * closer to a font list than to customer data — and the isolation test lists
 * it as such.
 */

export type SoundChoice = {
  /** What a storyboard writes into `sounds[].src`. */
  src: string;
  kind: SoundKind;
  mood: string | null;
  loopable: boolean;
  durationS: number | null;
  /** Seconds where the sound actually hits. */
  impacts: number[];
  usage: string | null;
};

function toChoice(row: SoundAsset): SoundChoice {
  return {
    src: row.key,
    kind: row.kind,
    mood: row.mood,
    loopable: row.loopable,
    durationS: row.durationS,
    impacts: Array.isArray(row.impacts) ? (row.impacts as number[]) : [],
    usage: row.usage,
  };
}

export async function listSounds(kind?: SoundKind): Promise<SoundChoice[]> {
  const rows = await (kind
    ? db.select().from(soundAssets).where(eq(soundAssets.kind, kind))
    : db.select().from(soundAssets).orderBy(asc(soundAssets.kind), asc(soundAssets.key)));
  return rows.map(toChoice);
}

/**
 * The catalogue as the model sees it: one line per sound, keyed by the exact
 * string it must copy. Bounded on purpose — a prompt carrying two hundred
 * sounds costs more than it helps, and the model only needs enough to choose.
 */
export function renderSoundCatalogue(
  sounds: SoundChoice[],
  { limit = 60 }: { limit?: number } = {}
): string {
  if (sounds.length === 0) return '';

  return sounds
    .slice(0, limit)
    .map((sound) => {
      const facts = [
        sound.kind,
        sound.mood,
        sound.loopable ? 'loopable' : null,
        sound.durationS ? `${Math.round(sound.durationS)}s` : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `- ${sound.src} (${facts}) — ${sound.usage ?? ''}`.trimEnd();
    })
    .join('\n');
}

/**
 * Keeps only the sounds that exist. A model that invents `sounds/sfx/boom.mp3`
 * would produce a storyboard the renderer cannot resolve, and the failure would
 * surface minutes later inside Lambda rather than here.
 */
export function keepKnownSounds<T extends { src?: unknown }>(
  candidates: T[] | undefined,
  library: SoundChoice[]
): T[] {
  if (!candidates?.length) return [];
  const known = new Set(library.map((sound) => sound.src));
  return candidates.filter(
    (candidate) => typeof candidate.src === 'string' && known.has(candidate.src)
  );
}
