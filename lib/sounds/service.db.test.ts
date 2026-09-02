import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { soundAssets } from '@/lib/db/schema';
import { closeDb, resetDb } from '@/lib/test/fixtures';
import { findSound } from './service';

/**
 * La lecture d'un son par sa clé.
 *
 * C'est ce que le rendu appelle pour retrouver les pics d'un morceau. Si elle
 * rend `null` là où le catalogue a une ligne, `onBeat` redevient silencieux et
 * rien ne le signale : l'effet sort, simplement pas sur le temps fort.
 */

afterAll(async () => {
  await closeDb();
});

const NAPPE = {
  key: 'sounds/music/weightless-horizon.mp3',
  name: 'weightless-horizon',
  kind: 'music' as const,
  mood: 'planant, futuriste, paisible',
  loopable: true,
  durationS: 31,
  musicalKey: 'A Min',
  bpm: 103,
  impacts: [13.1, 27.21, 27.77],
  usage: 'nappe minimale sous une explication',
};

describe('findSound', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rend les pics du morceau, qui sont ce que le rendu vient chercher', async () => {
    await db.insert(soundAssets).values(NAPPE);
    const trouve = await findSound(NAPPE.key);

    expect(trouve?.impacts).toEqual([13.1, 27.21, 27.77]);
    expect(trouve?.durationS).toBe(31);
  });

  it('rend null sur une clé inconnue plutôt que de lever', async () => {
    // Une vidéo peut porter la clé d'un son retiré du catalogue : le rendu
    // doit continuer sans musique, pas échouer.
    expect(await findSound('sounds/music/disparu.mp3')).toBeNull();
  });

  it('rend une liste vide quand le son n’a pas de pics', async () => {
    await db.insert(soundAssets).values({ ...NAPPE, impacts: null });
    expect((await findSound(NAPPE.key))?.impacts).toEqual([]);
  });

  it('n’est pas scopé au tenant : le catalogue est partagé', async () => {
    // `assets/sounds/README.md` le dit : la bibliothèque est commune à tous
    // les projets et survit à l'archivage.
    await db.insert(soundAssets).values(NAPPE);
    expect(await findSound(NAPPE.key)).not.toBeNull();
  });
});
