import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { creditLedger, shots, videos } from '@/lib/db/schema';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  closeDb,
  createProjectWithVideo,
  createTenant,
  resetDb,
} from '@/lib/test/fixtures';
import {
  InsufficientCreditsError,
  InvalidCreditAmountError,
  canAfford,
  debitCredits,
  estimateVideo,
  getBalance,
  grantCredits,
  ledgerSum,
  listLedger,
  refundVideo,
  validateAndChargeVideo,
  expirePlanCredits,
} from './ledger';

// Un client postgres partagé par worker : fermé une fois, après l'exécution
// de toutes les suites de ce fichier.
afterAll(async () => {
  await closeDb();
});

async function addShots(
  tdb: TenantDb,
  videoId: number,
  durations: number[]
) {
  await tdb.insert(
    shots,
    durations.map((durationS, index) => ({
      videoId,
      order: index + 1,
      type: 'video' as const,
      prompt: `Shot ${index + 1}`,
      durationS,
    }))
  );
}

describe('credit ledger', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('grants credits and records the movement', async () => {
    const tdb = await createTenant('Alpha');

    const result = await grantCredits(tdb, {
      amount: 1_000,
      reason: 'subscription_grant',
    });

    expect(result.balance).toBe(1_000);
    expect(result.entry.delta).toBe(1_000);
    expect(result.entry.balanceAfter).toBe(1_000);
    expect(await getBalance(tdb)).toBe(1_000);
  });

  it('debits credits and records the movement', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });

    const result = await debitCredits(tdb, {
      amount: 200,
      reason: 'video_debit',
    });

    expect(result.balance).toBe(300);
    expect(result.entry.delta).toBe(-200);
    expect(result.entry.balanceAfter).toBe(300);
  });

  it('keeps the balance equal to the sum of the ledger', async () => {
    const tdb = await createTenant('Alpha');

    await grantCredits(tdb, { amount: 1_000, reason: 'subscription_grant' });
    await debitCredits(tdb, { amount: 250, reason: 'video_debit' });
    await grantCredits(tdb, { amount: 100, reason: 'topup' });
    await debitCredits(tdb, { amount: 50, reason: 'video_debit' });

    expect(await ledgerSum(tdb)).toBe(await getBalance(tdb));
    expect(await getBalance(tdb)).toBe(800);
  });

  it('blocks a debit that would go below zero and writes nothing', async () => {
    const tdb = await createTenant('Alpha', { credits: 100 });

    await expect(
      debitCredits(tdb, { amount: 101, reason: 'video_debit' })
    ).rejects.toThrow(InsufficientCreditsError);

    expect(await getBalance(tdb)).toBe(100);
    expect(await listLedger(tdb)).toEqual([]);
  });

  it('blocks every debit once the balance is zero', async () => {
    const tdb = await createTenant('Alpha', { credits: 0 });

    await expect(
      debitCredits(tdb, { amount: 1, reason: 'video_debit' })
    ).rejects.toThrow(InsufficientCreditsError);
    expect(await canAfford(tdb, 1)).toBe(false);
  });

  it('allows a debit that lands exactly on zero', async () => {
    const tdb = await createTenant('Alpha', { credits: 42 });

    const result = await debitCredits(tdb, {
      amount: 42,
      reason: 'video_debit',
    });

    expect(result.balance).toBe(0);
  });

  it('reports how many credits were missing', async () => {
    const tdb = await createTenant('Alpha', { credits: 30 });

    await expect(
      debitCredits(tdb, { amount: 100, reason: 'video_debit' })
    ).rejects.toMatchObject({ required: 100, available: 30 });
  });

  it('never oversells under concurrent debits', async () => {
    const tdb = await createTenant('Alpha', { credits: 10 });

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        debitCredits(tdb, { amount: 3, reason: 'video_debit' })
      )
    );

    const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
    expect(succeeded).toBe(3);
    expect(await getBalance(tdb)).toBe(1);
    expect(await ledgerSum(tdb)).toBe(-9);
  });

  it('treats a replayed idempotency key as a no-op', async () => {
    const tdb = await createTenant('Alpha');

    const first = await grantCredits(tdb, {
      amount: 3_000,
      reason: 'topup',
      idempotencyKey: 'geniuspay:tx_123',
    });
    const replay = await grantCredits(tdb, {
      amount: 3_000,
      reason: 'topup',
      idempotencyKey: 'geniuspay:tx_123',
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.entry.id).toBe(first.entry.id);
    expect(await getBalance(tdb)).toBe(3_000);
    expect(await listLedger(tdb)).toHaveLength(1);
  });

  it('rejects a non-positive or fractional amount', async () => {
    const tdb = await createTenant('Alpha', { credits: 100 });

    await expect(
      debitCredits(tdb, { amount: 0, reason: 'video_debit' })
    ).rejects.toThrow(InvalidCreditAmountError);
    await expect(
      debitCredits(tdb, { amount: -5, reason: 'video_debit' })
    ).rejects.toThrow(InvalidCreditAmountError);
    await expect(
      grantCredits(tdb, { amount: 1.5, reason: 'topup' })
    ).rejects.toThrow(InvalidCreditAmountError);
  });

  it('keeps balances and ledgers separate per tenant', async () => {
    const alpha = await createTenant('Alpha', { credits: 100 });
    const beta = await createTenant('Beta', { credits: 100 });

    await debitCredits(alpha, { amount: 40, reason: 'video_debit' });

    expect(await getBalance(alpha)).toBe(60);
    expect(await getBalance(beta)).toBe(100);
    expect(await listLedger(beta)).toEqual([]);
  });
});

describe('video estimation and charging', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('estimates without touching the balance', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [6, 8, 5, 6]);

    const { creditsEstimated, balance } = await estimateVideo(tdb, video.id);

    // 25 s de plans animés à 2 crédits/s : l'image fixe est l'unité, un plan
    // qui bouge coûte le double.
    expect(creditsEstimated).toBe(50);
    expect(balance).toBe(500);
    expect(await listLedger(tdb)).toEqual([]);
    expect((await tdb.findById(videos, video.id))?.status).toBe('draft');
  });

  it('estimates 720p at three times the 480p rate', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb, {
      resolution: '720p',
    });
    await addShots(tdb, video.id, [6, 8, 5, 6]);

    const { creditsEstimated } = await estimateVideo(tdb, video.id);
    expect(creditsEstimated).toBe(150);
  });

  it('charges once at validation and moves the video forward', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [6, 8, 5, 6]);

    const result = await validateAndChargeVideo(tdb, video.id, { watermark: false });

    expect(result.charged).toBe(50);
    expect(result.balance).toBe(450);
    expect(result.video.status).toBe('validated');
    expect(result.video.creditsConsumed).toBe(50);

    const [entry] = await listLedger(tdb);
    expect(entry.delta).toBe(-50);
    expect(entry.reason).toBe('video_debit');
    expect(entry.videoId).toBe(video.id);
  });

  it('leaves the video in draft when the balance is too low', async () => {
    const tdb = await createTenant('Alpha', { credits: 10 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [6, 8, 5, 6]);

    await expect(validateAndChargeVideo(tdb, video.id, { watermark: false })).rejects.toThrow(
      InsufficientCreditsError
    );

    expect((await tdb.findById(videos, video.id))?.status).toBe('draft');
    expect(await getBalance(tdb)).toBe(10);
    expect(await listLedger(tdb)).toEqual([]);
  });

  it('refuses to charge a video twice', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [6, 8, 5, 6]);

    await validateAndChargeVideo(tdb, video.id, { watermark: false });

    await expect(validateAndChargeVideo(tdb, video.id, { watermark: false })).rejects.toThrow(
      /only a draft can be validated/
    );
    expect(await getBalance(tdb)).toBe(450);
  });

  it('refuses to charge an empty storyboard', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);

    await expect(validateAndChargeVideo(tdb, video.id, { watermark: false })).rejects.toThrow(
      /no shots/
    );
  });

  it('refuses to charge another tenant video', async () => {
    const alpha = await createTenant('Alpha', { credits: 500 });
    const beta = await createTenant('Beta', { credits: 500 });
    const { video } = await createProjectWithVideo(alpha);
    await addShots(alpha, video.id, [5]);

    await expect(validateAndChargeVideo(beta, video.id, { watermark: false })).rejects.toThrow(
      /not found for this tenant/
    );
    expect(await getBalance(beta)).toBe(500);
  });

  it('refunds what a failed video consumed', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [6, 8, 5, 6]);
    await validateAndChargeVideo(tdb, video.id, { watermark: false });

    const result = await refundVideo(tdb, video.id);

    expect(result.refunded).toBe(50);
    expect(result.balance).toBe(500);
    expect(result.video.status).toBe('failed');
    expect(result.video.creditsConsumed).toBe(0);
    expect(await ledgerSum(tdb)).toBe(0);
  });

  it('refunds at most once', async () => {
    const tdb = await createTenant('Alpha', { credits: 500 });
    const { video } = await createProjectWithVideo(tdb);
    await addShots(tdb, video.id, [5]);
    await validateAndChargeVideo(tdb, video.id, { watermark: false });

    await refundVideo(tdb, video.id);
    await refundVideo(tdb, video.id);

    expect(await getBalance(tdb)).toBe(500);
    const refunds = await tdb.findMany(
      creditLedger,
      eq(creditLedger.reason, 'video_refund')
    );
    expect(refunds).toHaveLength(1);
  });
});

describe('the two credit pockets', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('spends the expiring pocket before the one that was paid for', async () => {
    // Sinon le client perd de la valeur qu'il aurait pu consommer avant la
    // fin du cycle.
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, { amount: 100, reason: 'subscription_grant' });
    await grantCredits(tdb, { amount: 50, reason: 'topup' });

    await debitCredits(tdb, { amount: 60, reason: 'video_debit' });

    const tenant = await tdb.getTenant();
    expect(tenant?.creditsPlan).toBe(40);
    expect(tenant?.creditsTopup).toBe(50);
    expect(tenant?.creditsBalance).toBe(90);
  });

  it('writes one ledger line per pocket when a debit spans both', async () => {
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, { amount: 30, reason: 'subscription_grant' });
    await grantCredits(tdb, { amount: 100, reason: 'topup' });

    await debitCredits(tdb, {
      amount: 50,
      reason: 'video_debit',
      idempotencyKey: 'video:1:debit',
    });

    // L'ordre de listing n'est pas un contrat ; les deux lignes le sont.
    const debits = (await listLedger(tdb))
      .filter((row) => row.delta < 0)
      .map((row) => [row.pocket, row.delta])
      .sort();
    expect(debits).toEqual([
      ['plan', -30],
      ['topup', -20],
    ]);

    const tenant = await tdb.getTenant();
    expect(tenant?.creditsPlan).toBe(0);
    expect(tenant?.creditsTopup).toBe(80);
  });

  it('treats the replay of a debit that spanned both pockets as a no-op', async () => {
    // Les lignes d'un débit fractionné portent des clés suffixées
    // (`k:plan`, `k:topup`) : le replay qui sonde la clé exacte doit quand
    // même retrouver la trace du premier passage.
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, { amount: 30, reason: 'subscription_grant' });
    await grantCredits(tdb, { amount: 100, reason: 'topup' });

    const first = await debitCredits(tdb, {
      amount: 50,
      reason: 'video_debit',
      idempotencyKey: 'video:1:debit',
    });
    expect(first.replayed).toBe(false);

    const replay = await debitCredits(tdb, {
      amount: 50,
      reason: 'video_debit',
      idempotencyKey: 'video:1:debit',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.balance).toBe(first.balance);

    const debits = await listLedger(tdb);
    expect(debits.filter((row) => row.delta < 0)).toHaveLength(2);

    const tenant = await tdb.getTenant();
    expect(tenant?.creditsBalance).toBe(80);
  });

  it('keeps the balance equal to the sum of its pockets', async () => {
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, { amount: 100, reason: 'subscription_grant' });
    await grantCredits(tdb, { amount: 40, reason: 'topup' });
    await debitCredits(tdb, { amount: 130, reason: 'video_debit' });

    const tenant = await tdb.getTenant();
    expect(tenant?.creditsBalance).toBe(
      tenant!.creditsPlan + tenant!.creditsTopup
    );
    expect(tenant?.creditsBalance).toBe(10);
  });

  it('expires the plan quota and never the credits that were bought', async () => {
    // Faire expirer ce qu'un client a payé serait du vol.
    const tdb = await createTenant('Alpha');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await grantCredits(tdb, {
      amount: 100,
      reason: 'subscription_grant',
      expiresAt: yesterday,
    });
    await grantCredits(tdb, { amount: 40, reason: 'topup' });

    const { expired, balance } = await expirePlanCredits(tdb);

    expect(expired).toBe(100);
    expect(balance).toBe(40);
    const tenant = await tdb.getTenant();
    expect(tenant?.creditsTopup).toBe(40);
    expect(tenant?.planCreditsExpireAt).toBeNull();
  });

  it('leaves a quota that has not reached its date', async () => {
    const tdb = await createTenant('Alpha');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await grantCredits(tdb, {
      amount: 100,
      reason: 'subscription_grant',
      expiresAt: tomorrow,
    });

    expect((await expirePlanCredits(tdb)).expired).toBe(0);
    expect((await tdb.getTenant())?.creditsPlan).toBe(100);
  });

  it('does nothing the second time it runs on the same cycle', async () => {
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, {
      amount: 100,
      reason: 'subscription_grant',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expirePlanCredits(tdb);
    const second = await expirePlanCredits(tdb);

    expect(second.expired).toBe(0);
    expect(second.balance).toBe(0);
  });

  it('records the expiry so a customer can see what vanished', async () => {
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, {
      amount: 100,
      reason: 'subscription_grant',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expirePlanCredits(tdb);

    const [last] = (await listLedger(tdb)).filter(
      (row) => row.reason === 'plan_expiry'
    );
    expect(last.delta).toBe(-100);
    expect(last.pocket).toBe('plan');
    expect(last.balanceAfter).toBe(0);
  });

  it('refunds into the pocket that does not expire', async () => {
    // Un remboursement périmable punirait le client pour une panne qui n'est
    // pas la sienne.
    const tdb = await createTenant('Alpha');
    await grantCredits(tdb, { amount: 100, reason: 'subscription_grant' });
    await debitCredits(tdb, { amount: 40, reason: 'video_debit' });
    await grantCredits(tdb, { amount: 40, reason: 'video_refund' });

    const tenant = await tdb.getTenant();
    expect(tenant?.creditsPlan).toBe(60);
    expect(tenant?.creditsTopup).toBe(40);
  });
});
