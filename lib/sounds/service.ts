import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { soundAssets, type SoundAsset, type SoundKind } from '@/lib/db/schema';

/**
 * La bibliothèque de sons partagée.
 *
 * Lue via `db` plutôt que `tenantDb()` : la table ne porte pas de tenant_id
 * car elle n'appartient à aucun tenant. C'est un catalogue d'actifs
 * plateforme — plus proche d'une liste de polices que de données clients — et
 * le test d'isolation la liste comme telle.
 */

export type SoundChoice = {
  /** Ce qu'un storyboard écrit dans `sounds[].src`. */
  src: string;
  kind: SoundKind;
  mood: string | null;
  loopable: boolean;
  durationS: number | null;
  /** Secondes où le son frappe réellement. */
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

/**
 * Un son par sa clé, ou rien.
 *
 * Sert au rendu : une vidéo ne stocke que la clé de sa musique, et le moteur a
 * besoin de ses pics pour caler un effet dessus. Sans cette lecture, `onBeat`
 * reste inerte — le catalogue sait quand le morceau frappe, la composition
 * l'ignore.
 *
 * Non scopé au tenant : le catalogue est partagé entre tous les projets, comme
 * le dit `assets/sounds/README.md`.
 */
export async function findSound(key: string): Promise<SoundChoice | null> {
  const [row] = await db
    .select()
    .from(soundAssets)
    .where(eq(soundAssets.key, key))
    .limit(1);
  return row ? toChoice(row) : null;
}

export async function listSounds(kind?: SoundKind): Promise<SoundChoice[]> {
  const rows = await (kind
    ? db.select().from(soundAssets).where(eq(soundAssets.kind, kind))
    : db.select().from(soundAssets).orderBy(asc(soundAssets.kind), asc(soundAssets.key)));
  return rows.map(toChoice);
}

/**
 * Le catalogue tel que le modèle le voit : une ligne par son, clé par la
 * chaîne exacte qu'il doit copier. Borné volontairement — un prompt portant
 * deux cents sons coûte plus qu'il n'aide, et le modèle n'a besoin que de
 * quoi choisir.
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
 * Ne garde que les sons qui existent. Un modèle qui invente
 * `sounds/sfx/boom.mp3` produirait un storyboard que le renderer ne peut pas
 * résoudre, et l'échec surgirait quelques minutes plus tard dans Lambda
 * plutôt qu'ici.
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
