import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { soundAssets } from '@/lib/db/schema';
import { closeDb, resetDb } from '@/lib/test/fixtures';
import { parseCatalogue } from './import-catalog';
import { keepKnownSounds, listSounds, renderSoundCatalogue } from './service';

afterAll(async () => {
  await closeDb();
});

/** Deux lignes dans le format exact que le `npm run sounds` du pipeline émet. */
const CATALOGUE = `# 🎧 Catalogue des sons — GÉNÉRÉ AUTOMATIQUEMENT

| Nom | Type | Ambiance | Bouclable | Durée | Tonalité | BPM | Pics d'impact (s) | Usage | \`src\` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| \`arcade-room\` | ambient | rétro, bruyant | true | 33s | D Min | - | \`[5.6, 10.38]\` | ambiance de salle d'arcade | \`sounds/ambient/arcade-room.mp3\` |
| \`pop\` | sfx | sec, dynamique | false | 2.8s | - | 120 | \`[0.1]\` | apparition d'un chiffre à l'écran | \`sounds/sfx/pop.mp3\` |
`;

describe('importing a catalogue', () => {
  it('reads the metadata and skips the header', () => {
    const rows = parseCatalogue(CATALOGUE);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: 'sounds/ambient/arcade-room.mp3',
      name: 'arcade-room',
      kind: 'ambient',
      mood: 'rétro, bruyant',
      loopable: true,
      durationS: 33,
      musicalKey: 'D Min',
      bpm: null,
      impacts: [5.6, 10.38],
    });
    expect(rows[1]).toMatchObject({
      key: 'sounds/sfx/pop.mp3',
      kind: 'sfx',
      loopable: false,
      durationS: 2.8,
      musicalKey: null,
      bpm: 120,
      impacts: [0.1],
    });
  });

  it('ignores a row whose kind is not one we store', () => {
    const rows = parseCatalogue(
      CATALOGUE + '| `x` | podcast | - | false | 1s | - | - | - | - | `sounds/x.mp3` |\n'
    );
    expect(rows).toHaveLength(2);
  });
});

describe('the catalogue as the model sees it', () => {
  it('lists one line per sound, keyed by the exact string to copy', () => {
    const rendered = renderSoundCatalogue([
      {
        src: 'sounds/sfx/pop.mp3',
        name: 'pop',
    kind: 'sfx',
        mood: 'sec',
        loopable: false,
        durationS: 2.8,
        impacts: [0.1],
        usage: 'apparition d’un chiffre',
      },
    ]);

    expect(rendered).toBe(
      '- sounds/sfx/pop.mp3 (sfx, sec, 3s) — apparition d’un chiffre'
    );
  });

  it('stays bounded: a prompt carrying every sound costs more than it helps', () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      src: `sounds/sfx/s${index}.mp3`,
      name: `s${index}`,
      kind: 'sfx' as const,
      mood: null,
      loopable: false,
      durationS: null,
      impacts: [],
      usage: null,
    }));

    expect(renderSoundCatalogue(many).split('\n')).toHaveLength(60);
    expect(renderSoundCatalogue(many, { limit: 5 }).split('\n')).toHaveLength(5);
    expect(renderSoundCatalogue([])).toBe('');
  });
});

describe('filtering what the model picked', () => {
  const library = [
    {
      src: 'sounds/sfx/pop.mp3',
      name: 'pop',
    kind: 'sfx' as const,
      mood: null,
      loopable: false,
      durationS: null,
      impacts: [],
      usage: null,
    },
  ];

  it('keeps the known sounds and drops the invented ones', () => {
    // Un chemin inventé échoue quelques minutes plus tard dans le renderer,
    // pas ici.
    expect(
      keepKnownSounds(
        [
          { src: 'sounds/sfx/pop.mp3', volume: 0.5 },
          { src: 'sounds/sfx/imaginary.mp3' },
          { volume: 1 },
        ],
        library
      )
    ).toEqual([{ src: 'sounds/sfx/pop.mp3', volume: 0.5 }]);
  });

  it('handles the empty cases without ceremony', () => {
    expect(keepKnownSounds(undefined, library)).toEqual([]);
    expect(keepKnownSounds([], library)).toEqual([]);
    expect(keepKnownSounds([{ src: 'sounds/sfx/pop.mp3' }], [])).toEqual([]);
  });
});

describe('the shared library', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('is readable by everyone, because it belongs to no one', async () => {
    // Pas de tenant_id sur cette table : c'est un catalogue plateforme, et le
    // test d'isolation la liste comme exception délibérée.
    await db.insert(soundAssets).values(
      parseCatalogue(CATALOGUE).map((row) => ({ ...row }))
    );

    const all = await listSounds();
    expect(all.map((sound) => sound.src).sort()).toEqual([
      'sounds/ambient/arcade-room.mp3',
      'sounds/sfx/pop.mp3',
    ]);

    const sfx = await listSounds('sfx');
    expect(sfx.map((sound) => sound.src)).toEqual(['sounds/sfx/pop.mp3']);
    expect(sfx[0].impacts).toEqual([0.1]);
  });

  it('is empty until a catalogue is imported', async () => {
    expect(await listSounds()).toEqual([]);
  });
});
