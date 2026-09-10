import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { subscriptions } from '@/lib/db/schema';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  finalizeCancellation,
  revertCancellation,
  scheduleCancellation,
  shouldCancelNow,
} from './cancellation';

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

describe('scheduleCancellation', () => {
  it('pose cancel_at sur currentPeriodEnd', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    const periodEnd = new Date('2026-10-01');

    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: periodEnd,
    });

    const updated = await scheduleCancellation(tdb);
    expect(updated.cancelAt).toEqual(periodEnd);
    expect(updated.status).toBe('active');
  });

  it('est idempotent si cancel_at est déjà posé', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    const periodEnd = new Date('2026-10-01');

    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: periodEnd,
      cancelAt: periodEnd,
    });

    const updated = await scheduleCancellation(tdb);
    expect(updated.cancelAt).toEqual(periodEnd);
  });

  it('refuse si pas de subscription', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    await expect(scheduleCancellation(tdb)).rejects.toThrow(/No active subscription/);
  });

  it('refuse si pas de période en cours', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'pending',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    await expect(scheduleCancellation(tdb)).rejects.toThrow(
      /no current billing period/
    );
  });
});

describe('revertCancellation', () => {
  it('retire cancel_at pour réactiver le renouvellement', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    const periodEnd = new Date('2026-10-01');

    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: periodEnd,
      cancelAt: periodEnd,
    });

    const updated = await revertCancellation(tdb);
    expect(updated.cancelAt).toBeNull();
    expect(updated.status).toBe('active');
  });

  it('est idempotent si cancel_at n est pas posé', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAt: null,
    });

    const updated = await revertCancellation(tdb);
    expect(updated.cancelAt).toBeNull();
  });

  it('refuse si l abonnement est déjà canceled', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'canceled',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAt: new Date('2026-10-01'),
    });

    await expect(revertCancellation(tdb)).rejects.toThrow(/already canceled/);
  });
});

describe('shouldCancelNow', () => {
  it('renvoie true si cancel_at est dans le passé', async () => {
    const sub = {
      id: 1,
      tenantId: 1,
      plan: 'pro' as const,
      status: 'active' as const,
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAt: new Date('2026-09-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(await shouldCancelNow(sub)).toBe(true);
  });

  it('renvoie false si cancel_at est dans le futur', async () => {
    const sub = {
      id: 1,
      tenantId: 1,
      plan: 'pro' as const,
      status: 'active' as const,
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2099-01-01'),
      cancelAt: new Date('2099-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(await shouldCancelNow(sub)).toBe(false);
  });

  it('renvoie false si cancel_at n est pas posé', async () => {
    const sub = {
      id: 1,
      tenantId: 1,
      plan: 'pro' as const,
      status: 'active' as const,
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(await shouldCancelNow(sub)).toBe(false);
  });
});

describe('finalizeCancellation', () => {
  it('bascule le statut en canceled', async () => {
    const tdb = await createTenant('Alpha', { plan: 'pro' });
    const [sub] = await tdb.insert(subscriptions, {
      plan: 'pro',
      status: 'active',
      currentPeriodStart: new Date('2026-09-01'),
      currentPeriodEnd: new Date('2026-10-01'),
      cancelAt: new Date('2026-10-01'),
    });

    const updated = await finalizeCancellation(tdb, sub.id);
    expect(updated.status).toBe('canceled');
    expect(updated.cancelAt).toEqual(sub.cancelAt);
  });
});
