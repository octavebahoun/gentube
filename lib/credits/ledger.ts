import { and, eq, gte, sql } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import {
  creditLedger,
  creditPocketEnum,
  creditReasonEnum,
  shots,
  tenants,
  videos,
  type CreditLedgerEntry,
  type Video,
} from '@/lib/db/schema';
import { estimateVideoCredits } from './pricing';

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number
  ) {
    super(
      `Insufficient credits: ${required} required, ${available} available.`
    );
    this.name = 'InsufficientCreditsError';
  }
}

export class InvalidCreditAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid credit amount: ${amount}. Must be a positive integer.`);
    this.name = 'InvalidCreditAmountError';
  }
}

export type CreditReason = (typeof creditReasonEnum.enumValues)[number];
export type CreditPocket = (typeof creditPocketEnum.enumValues)[number];

/**
 * Quelle poche une écriture alimente, quand l'appelant ne le dit pas.
 *
 * Une dotation de plan va dans la poche périssable ; tout le reste — recharge,
 * remboursement, geste commercial — va dans celle qui n'expire jamais.
 * Rembourser vers `plan` rendrait le remboursement périmable, ce qui punirait
 * un client pour une panne qui n'est pas la sienne.
 */
const DEFAULT_POCKET: Record<CreditReason, CreditPocket> = {
  signup_grant: 'plan',
  subscription_grant: 'plan',
  plan_expiry: 'plan',
  topup: 'topup',
  video_debit: 'plan',
  video_refund: 'topup',
  manual_adjustment: 'topup',
};

export type LedgerResult = {
  entry: CreditLedgerEntry;
  balance: number;
  /** Vrai quand une clé d'idempotence a matché une écriture existante et que rien n'a bougé. */
  replayed: boolean;
};

type MovementInput = {
  amount: number;
  reason: CreditReason;
  videoId?: number;
  /** À poser sur les écritures pilotées par webhook pour qu'un replay soit un no-op. */
  idempotencyKey?: string;
  /** Poche alimentée. Déduite de `reason` si absente. */
  pocket?: CreditPocket;
  /** Fin de validité du quota de plan. Ignoré pour la poche `topup`. */
  expiresAt?: Date;
};

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidCreditAmountError(amount);
  }
}

async function findReplay(
  tdb: TenantDb,
  idempotencyKey?: string
): Promise<CreditLedgerEntry | null> {
  if (!idempotencyKey) return null;
  return await tdb.findFirst(
    creditLedger,
    eq(creditLedger.idempotencyKey, idempotencyKey)
  );
}

/** Solde de crédits actuel du tenant. */
export async function getBalance(tdb: TenantDb): Promise<number> {
  const tenant = await tdb.getTenant();
  if (!tenant) throw new Error(`Tenant ${tdb.tenantId} not found.`);
  return tenant.creditsBalance;
}

export async function canAfford(
  tdb: TenantDb,
  amount: number
): Promise<boolean> {
  return (await getBalance(tdb)) >= amount;
}

/**
 * Ajoute des crédits (dotation de plan, recharge, remboursement). La ligne du
 * tenant et l'écriture du grand livre bougent ensemble dans une transaction.
 */
export async function grantCredits(
  tdb: TenantDb,
  { amount, reason, videoId, idempotencyKey, pocket, expiresAt }: MovementInput
): Promise<LedgerResult> {
  assertAmount(amount);

  return await tdb.transaction(async (tx) => {
    const replay = await findReplay(tx, idempotencyKey);
    if (replay) {
      return { entry: replay, balance: await getBalance(tx), replayed: true };
    }

    const target = pocket ?? DEFAULT_POCKET[reason];
    const column = target === 'plan' ? tenants.creditsPlan : tenants.creditsTopup;

    const [tenant] = await tx.updateTenant({
      creditsBalance: sql`${tenants.creditsBalance} + ${amount}`,
      [target === 'plan' ? 'creditsPlan' : 'creditsTopup']: sql`${column} + ${amount}`,
      ...(target === 'plan' && expiresAt ? { planCreditsExpireAt: expiresAt } : {}),
      updatedAt: new Date(),
    });
    if (!tenant) throw new Error(`Tenant ${tx.tenantId} not found.`);

    const [entry] = await tx.insert(creditLedger, {
      delta: amount,
      reason,
      pocket: target,
      videoId: videoId ?? null,
      balanceAfter: tenant.creditsBalance,
      idempotencyKey: idempotencyKey ?? null,
    });

    return { entry, balance: tenant.creditsBalance, replayed: false };
  });
}

/**
 * Retire des crédits. Bloque à zéro : le solde est décrémenté par un
 * `UPDATE ... WHERE credits_balance >= amount` conditionnel, donc des débits
 * concurrents se sérialisent sur la ligne du tenant et le solde ne peut jamais
 * devenir négatif. Quand la garde échoue, rien n'est écrit et une
 * `InsufficientCreditsError` est levée.
 */
export async function debitCredits(
  tdb: TenantDb,
  { amount, reason, videoId, idempotencyKey }: MovementInput
): Promise<LedgerResult> {
  assertAmount(amount);

  return await tdb.transaction(async (tx) => {
    const replay = await findReplay(tx, idempotencyKey);
    if (replay) {
      return { entry: replay, balance: await getBalance(tx), replayed: true };
    }

    // On prend d'abord dans la poche qui expire, pour que personne ne perde
    // de la valeur qu'il aurait pu consommer avant la fin du cycle.
    const current = await tx.getTenant();
    if (!current) throw new Error(`Tenant ${tx.tenantId} not found.`);

    const fromPlan = Math.min(current.creditsPlan, amount);
    const fromTopup = amount - fromPlan;

    // Concurrence optimiste : la garde porte sur chaque poche, donc un débit
    // parti d'une lecture périmée échoue au lieu de creuser un solde négatif.
    const [tenant] = await tx.updateTenant(
      {
        creditsBalance: sql`${tenants.creditsBalance} - ${amount}`,
        creditsPlan: sql`${tenants.creditsPlan} - ${fromPlan}`,
        creditsTopup: sql`${tenants.creditsTopup} - ${fromTopup}`,
        updatedAt: new Date(),
      },
      and(
        gte(tenants.creditsPlan, fromPlan),
        gte(tenants.creditsTopup, fromTopup)
      )
    );

    if (!tenant) {
      throw new InsufficientCreditsError(amount, await getBalance(tx));
    }

    // Un débit qui traverse les deux poches écrit une ligne par poche : le
    // grand livre reste lisible ligne à ligne, et la clé d'idempotence — qui
    // est unique — est suffixée pour que les deux puissent coexister.
    const movements = (
      [
        ['plan', fromPlan],
        ['topup', fromTopup],
      ] as const
    ).filter(([, taken]) => taken > 0);

    const entries: CreditLedgerEntry[] = [];
    for (const [target, taken] of movements) {
      const [written] = await tx.insert(creditLedger, {
        delta: -taken,
        reason,
        pocket: target,
        videoId: videoId ?? null,
        balanceAfter: tenant.creditsBalance,
        idempotencyKey: idempotencyKey
          ? movements.length > 1
            ? `${idempotencyKey}:${target}`
            : idempotencyKey
          : null,
      });
      entries.push(written);
    }

    return { entry: entries[0], balance: tenant.creditsBalance, replayed: false };
  });
}

/**
 * Estime une vidéo à partir de son storyboard et stocke l'estimation. En
 * lecture seule sur le solde — rien n'est facturé ici (cahier des charges §4 :
 * le débit a lieu à la validation, jamais avant).
 */
export async function estimateVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; creditsEstimated: number; balance: number }> {
  const video = await tdb.findById(videos, videoId);
  if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);

  const storyboard = await tdb.findMany(shots, eq(shots.videoId, videoId));
  const creditsEstimated = estimateVideoCredits(storyboard, video.resolution);

  const [updated] = await tdb.update(
    videos,
    { creditsEstimated, updatedAt: new Date() },
    eq(videos.id, videoId)
  );

  return { video: updated, creditsEstimated, balance: await getBalance(tdb) };
}

/**
 * Valide un storyboard et le facture. C'est l'unique point où une vidéo quitte
 * `draft`, et le seul endroit où des crédits vidéo sont débités.
 *
 * La facturation et le changement de statut partagent une transaction, donc
 * un débit échoué laisse la vidéo en `draft` sans aucune ligne de grand livre.
 */
export async function validateAndChargeVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; charged: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const video = await tx.findById(videos, videoId);
    if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);
    if (video.status !== 'draft') {
      throw new Error(
        `Video ${videoId} is ${video.status}; only a draft can be validated.`
      );
    }

    const storyboard = await tx.findMany(shots, eq(shots.videoId, videoId));
    if (storyboard.length === 0) {
      throw new Error(`Video ${videoId} has no shots to generate.`);
    }

    const charged = estimateVideoCredits(storyboard, video.resolution);

    const { balance } = await debitCredits(tx, {
      amount: charged,
      reason: 'video_debit',
      videoId,
      idempotencyKey: `video:${videoId}:debit`,
    });

    const [updated] = await tx.update(
      videos,
      {
        status: 'validated',
        creditsEstimated: charged,
        creditsConsumed: charged,
        updatedAt: new Date(),
      },
      eq(videos.id, videoId)
    );

    return { video: updated, charged, balance };
  });
}

/**
 * Rend ce qu'une vidéo échouée a consommé. Rembourse au plus ce qui a été
 * réellement facturé, et marque la vidéo `failed`.
 */
export async function refundVideo(
  tdb: TenantDb,
  videoId: number
): Promise<{ video: Video; refunded: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const video = await tx.findById(videos, videoId);
    if (!video) throw new Error(`Video ${videoId} not found for this tenant.`);

    const refunded = video.creditsConsumed;
    let balance = await getBalance(tx);

    if (refunded > 0) {
      ({ balance } = await grantCredits(tx, {
        amount: refunded,
        reason: 'video_refund',
        videoId,
        idempotencyKey: `video:${videoId}:refund`,
      }));
    }

    const [updated] = await tx.update(
      videos,
      { status: 'failed', creditsConsumed: 0, updatedAt: new Date() },
      eq(videos.id, videoId)
    );

    return { video: updated, refunded, balance };
  });
}

/** Historique du grand livre, du plus récent au plus ancien. */
export async function listLedger(
  tdb: TenantDb,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  return await tdb.findMany(creditLedger, undefined, {
    orderBy: [sql`${creditLedger.createdAt} desc`, sql`${creditLedger.id} desc`],
    limit,
  });
}

/** Somme de tous les deltas du grand livre — doit toujours égaler `tenants.credits_balance`. */
export async function ledgerSum(tdb: TenantDb): Promise<number> {
  const rows = await tdb.findMany(creditLedger);
  return rows.reduce((total, row) => total + row.delta, 0);
}

export { and, eq };

/**
 * Fait tomber le quota de plan arrivé à échéance.
 *
 * Les crédits **achetés** ne sont pas touchés : ils n'expirent jamais, faire
 * expirer ce qu'un client a payé serait du vol. Seule la poche `plan` retombe
 * à zéro, et l'opération est tracée dans le grand livre pour qu'un client
 * puisse voir ce qui a disparu, quand, et pourquoi.
 *
 * Idempotent : appelée deux fois le même cycle, la seconde ne fait rien.
 * Sûre à appeler avant n'importe quelle lecture de solde.
 */
export async function expirePlanCredits(
  tdb: TenantDb,
  now: Date = new Date()
): Promise<{ expired: number; balance: number }> {
  return await tdb.transaction(async (tx) => {
    const tenant = await tx.getTenant();
    if (!tenant) throw new Error(`Tenant ${tx.tenantId} not found.`);

    const due =
      tenant.planCreditsExpireAt !== null &&
      tenant.planCreditsExpireAt <= now &&
      tenant.creditsPlan > 0;

    if (!due) {
      return { expired: 0, balance: tenant.creditsBalance };
    }

    const expired = tenant.creditsPlan;
    const [updated] = await tx.updateTenant(
      {
        creditsBalance: sql`${tenants.creditsBalance} - ${expired}`,
        creditsPlan: 0,
        planCreditsExpireAt: null,
        updatedAt: new Date(),
      },
      gte(tenants.creditsPlan, expired)
    );
    if (!updated) {
      // Un débit concurrent a entamé la poche : elle sera périmée au prochain
      // passage, sur des valeurs fraîches.
      return { expired: 0, balance: await getBalance(tx) };
    }

    await tx.insert(creditLedger, {
      delta: -expired,
      reason: 'plan_expiry',
      pocket: 'plan',
      videoId: null,
      balanceAfter: updated.creditsBalance,
      idempotencyKey: `plan_expiry:${tx.tenantId}:${tenant.planCreditsExpireAt!.toISOString()}`,
    });

    return { expired, balance: updated.creditsBalance };
  });
}
