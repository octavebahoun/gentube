import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { shots, videos } from '@/lib/db/schema';
import { getBalance, refundVideo, validateAndChargeVideo } from '@/lib/credits';
import { STANDARD_CAP_BY_PLAN } from '@/lib/credits/pricing';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  closeDb,
  createProjectWithVideo,
  createTenant,
  resetDb,
  subscribe,
} from '@/lib/test/fixtures';
import { StandardCapReachedError, consommationCinema } from './plafond';

afterAll(async () => {
  await closeDb();
});

/**
 * Une vidéo prête à être validée, d'un coût choisi.
 *
 * Le coût se pilote par la durée : en Cinéma, `secondes × 7`, plus les 25
 * crédits de montage.
 */
async function videoDe(
  tdb: TenantDb,
  { secondes, quality }: { secondes: number; quality: 'draft' | 'standard' }
) {
  const { video } = await createProjectWithVideo(tdb, { quality });
  await tdb.insert(shots, {
    videoId: video.id,
    order: 1,
    type: 'video',
    narration: 'a'.repeat(40),
    prompt: 'un lent travelling avant sur un baobab',
    durationS: secondes,
    durationSource: 'measured',
  });
  return video;
}

const PLAFOND = STANDARD_CAP_BY_PLAN.pro as number;

describe('le plafond de Cinéma', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('laisse passer tant que le cycle n est pas consommé', async () => {
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro');

    // 10 s de Cinéma : 70 crédits, plus 25 de montage — 95, bien sous 200.
    const video = await videoDe(tdb, { secondes: 10, quality: 'standard' });
    const { charged } = await validateAndChargeVideo(tdb, video.id, {
      watermark: false,
    });

    expect(charged).toBe(95);
    expect(await consommationCinema(tdb)).toMatchObject({
      consomme: 95,
      plafond: PLAFOND,
      restant: PLAFOND - 95,
    });
  });

  it('refuse le débit qui ferait dépasser, et ne débite rien', async () => {
    /*
     * Le point qui compte : le refus laisse la vidéo en brouillon et le solde
     * intact. Un plafond qui débiterait puis refuserait serait pire que pas de
     * plafond du tout.
     */
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro');

    const premiere = await videoDe(tdb, { secondes: 10, quality: 'standard' });
    await validateAndChargeVideo(tdb, premiere.id, { watermark: false });
    const soldeApres = await getBalance(tdb);

    // 95 + 130 dépasserait les 200.
    const seconde = await videoDe(tdb, { secondes: 15, quality: 'standard' });
    await expect(
      validateAndChargeVideo(tdb, seconde.id, { watermark: false })
    ).rejects.toThrow(StandardCapReachedError);

    expect(await getBalance(tdb)).toBe(soldeApres);
    expect((await tdb.findById(videos, seconde.id))?.status).toBe('draft');
  });

  it('ne plafonne jamais le Full HD', async () => {
    // Le Full HD coûte 0,01 $/s : le plafonner reviendrait à brider le palier
    // qui tient la marge.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro');

    for (let n = 0; n < 5; n += 1) {
      const video = await videoDe(tdb, { secondes: 10, quality: 'draft' });
      await validateAndChargeVideo(tdb, video.id, { watermark: false });
    }

    // 5 × 45 crédits de Full HD, et le compteur de Cinéma n'a pas bougé.
    expect((await consommationCinema(tdb)).consomme).toBe(0);
  });

  it('rend au plafond ce qu une vidéo échouée a rendu au solde', async () => {
    /*
     * Un remboursement qui ne libérerait pas le plafond ferait payer au client
     * une vidéo qu'il n'a pas eue — pas en crédits, mais en droit de produire.
     */
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro');

    const video = await videoDe(tdb, { secondes: 10, quality: 'standard' });
    await validateAndChargeVideo(tdb, video.id, { watermark: false });
    expect((await consommationCinema(tdb)).consomme).toBe(95);

    await refundVideo(tdb, video.id);
    expect((await consommationCinema(tdb)).consomme).toBe(0);
  });

  it('ne compte pas les vidéos d un cycle précédent', async () => {
    // Le plafond est mensuel : le débit d'avant-hier compte, celui d'il y a
    // deux mois non. Le cycle courant est la seule fenêtre.
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro');

    const { consomme, plafond } = await consommationCinema(tdb, {
      now: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
    // Deux mois plus tard, plus aucun cycle ne couvre l'instant demandé.
    expect(consomme).toBe(0);
    expect(plafond).toBeNull();
  });

  it('ne s applique pas sans cycle de facturation', async () => {
    /*
     * Sans abonnement payé il n'y a pas de cycle, donc rien à plafonner — et
     * c'est `assertQualityAllowed` qui refuse le palier bien avant. Ce n'est
     * pas un trou : c'est l'autre verrou qui parle en premier.
     */
    const tdb = await createTenant('Alpha', { credits: 5_000 });
    await subscribe(tdb, 'pro', { cycle: false });

    expect(await consommationCinema(tdb)).toMatchObject({
      consomme: 0,
      plafond: null,
      restant: null,
    });
  });

  it('dit au client ce qui lui reste, pas seulement que c est refusé', async () => {
    // Un 402 sans chiffre oblige le client à deviner s'il doit attendre un
    // jour ou un mois.
    const erreur = new StandardCapReachedError(180, PLAFOND, 95);
    expect(erreur.message).toContain('180');
    expect(erreur.message).toContain(String(PLAFOND));
    expect(erreur.message).toContain('Cinéma');
    expect(erreur.statusCode).toBe(402);
  });
});
