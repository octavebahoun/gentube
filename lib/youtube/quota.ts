import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { youtubeQuotaUsage } from '@/lib/db/schema';

/**
 * Le quota YouTube se réinitialise à minuit Pacifique (heure de Google).
 * À Cotonou, c'est 9h du matin en heure d'hiver.
 *
 * Depuis juin 2026, les uploads ont leur propre quota d'environ 100 appels/jour.
 * Un upload coûte environ 100 unités depuis décembre 2025.
 */

export const DAILY_QUOTA_LIMIT = 10_000;
export const UPLOAD_COST = 100;

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Retourne la date actuelle au format YYYY-MM-DD en heure Pacifique.
 */
function getPacificDay(): string {
  const now = new Date();
  const pacific = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return pacific;
}

/**
 * Récupère ou crée l'entrée de quota pour aujourd'hui.
 */
async function getOrCreateQuotaUsage(day: string) {
  const existing = await db
    .select()
    .from(youtubeQuotaUsage)
    .where(eq(youtubeQuotaUsage.day, day))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(youtubeQuotaUsage)
    .values({ day, unitsUsed: 0 })
    .returning();

  return created;
}

/**
 * Vérifie si le quota est disponible pour un coût donné.
 * Lance QuotaExceededError si le quota est dépassé.
 */
export async function checkQuotaAvailable(cost: number): Promise<void> {
  const day = getPacificDay();
  const usage = await getOrCreateQuotaUsage(day);

  if (usage.unitsUsed + cost > DAILY_QUOTA_LIMIT) {
    throw new QuotaExceededError(
      `YouTube quota exceeded for ${day}. Try again tomorrow.`
    );
  }
}

/**
 * Incrémente le quota utilisé pour aujourd'hui.
 * À appeler dans la transaction qui crée la publication.
 */
export async function incrementQuota(cost: number): Promise<void> {
  const day = getPacificDay();
  await getOrCreateQuotaUsage(day);

  await db
    .update(youtubeQuotaUsage)
    .set({
      unitsUsed: (await db
        .select()
        .from(youtubeQuotaUsage)
        .where(eq(youtubeQuotaUsage.day, day))
        .limit(1)
        .then((rows: typeof youtubeQuotaUsage.$inferSelect[]) => rows[0]?.unitsUsed || 0)) + cost,
      updatedAt: new Date(),
    })
    .where(eq(youtubeQuotaUsage.day, day));
}

/**
 * Récupère le quota utilisé aujourd'hui et la limite.
 */
export async function getQuotaStatus(): Promise<{
  day: string;
  used: number;
  limit: number;
  remaining: number;
}> {
  const day = getPacificDay();
  const usage = await getOrCreateQuotaUsage(day);

  return {
    day,
    used: usage.unitsUsed,
    limit: DAILY_QUOTA_LIMIT,
    remaining: Math.max(0, DAILY_QUOTA_LIMIT - usage.unitsUsed),
  };
}
