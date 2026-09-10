import { eq } from 'drizzle-orm';
import type { TenantDb } from '@/lib/db/tenant-db';
import { subscriptions, type Subscription } from '@/lib/db/schema';
import { BillingError, getSubscription } from './checkout';

/**
 * Annulation d'abonnement à la fin du cycle courant.
 *
 * **Contrat cancel_at** (Stripe-style) :
 * - L'abonnement reste actif jusqu'à `currentPeriodEnd`
 * - Aucun nouveau cycle ne démarre après cette date
 * - Le tenant garde son solde et peut continuer à générer jusqu'à épuisement
 * - `cancel_at` est posé sur `currentPeriodEnd` : la date de résiliation effective
 *
 * **Différence avec suspended** :
 * - `suspended` : échec de paiement après réessais → plus de renouvellement automatique
 * - `canceled` avec `cancel_at` : choix du tenant → renouvellement programmé pour s'arrêter
 */

/**
 * Programme l'annulation d'un abonnement à la fin du cycle en cours.
 *
 * **Effet immédiat** : `cancel_at` est posé sur `currentPeriodEnd`.
 * **Effet différé** : le système de renouvellement lira `cancel_at` et
 * basculera le statut en `canceled` au lieu de créer un nouveau cycle.
 *
 * Idempotent : appeler plusieurs fois ne change rien si `cancel_at` est déjà posé.
 */
export async function scheduleCancellation(
  tdb: TenantDb
): Promise<Subscription> {
  const subscription = await getSubscription(tdb);
  if (!subscription) {
    throw new BillingError('No active subscription.', 404);
  }

  // Déjà programmé : idempotent
  if (subscription.cancelAt) {
    return subscription;
  }

  if (!subscription.currentPeriodEnd) {
    throw new BillingError(
      'Cannot cancel subscription: no current billing period.',
      400
    );
  }

  // Pose la date d'annulation à la fin du cycle actuel
  const [updated] = await tdb.update(
    subscriptions,
    {
      cancelAt: subscription.currentPeriodEnd,
      updatedAt: new Date(),
    },
    eq(subscriptions.id, subscription.id)
  );

  return updated;
}

/**
 * Annule la programmation d'annulation (réactive le renouvellement).
 *
 * Un client qui change d'avis avant la fin du cycle peut retirer son annulation.
 * Seule contrainte : le faire **avant** `currentPeriodEnd`, sinon l'abonnement
 * sera déjà passé en `canceled` et il faudra souscrire à nouveau.
 */
export async function revertCancellation(
  tdb: TenantDb
): Promise<Subscription> {
  const subscription = await getSubscription(tdb);
  if (!subscription) {
    throw new BillingError('No active subscription.', 404);
  }

  // Rien à faire si pas d'annulation programmée
  if (!subscription.cancelAt) {
    return subscription;
  }

  // Annulation déjà effective : trop tard pour revenir en arrière
  if (subscription.status === 'canceled') {
    throw new BillingError(
      'Subscription is already canceled. Please create a new subscription.',
      400
    );
  }

  const [updated] = await tdb.update(
    subscriptions,
    {
      cancelAt: null,
      updatedAt: new Date(),
    },
    eq(subscriptions.id, subscription.id)
  );

  return updated;
}

/**
 * Vérifie si un abonnement doit être annulé maintenant.
 *
 * Appelé par le système de renouvellement : si `cancel_at` est dans le passé,
 * l'abonnement bascule en `canceled` au lieu de créer un nouveau cycle.
 *
 * **À intégrer dans le réveil/renouvellement** : quand on arrive à
 * `currentPeriodEnd`, regarder si `cancel_at` est posé. Si oui, finaliser
 * l'annulation au lieu de renouveler.
 */
export async function shouldCancelNow(subscription: Subscription): Promise<boolean> {
  if (!subscription.cancelAt) return false;
  return subscription.cancelAt <= new Date();
}

/**
 * Finalise l'annulation d'un abonnement (passage en statut `canceled`).
 *
 * Appelé par le système de renouvellement quand `shouldCancelNow()` renvoie true.
 * **Ne pas appeler directement** : utiliser `scheduleCancellation()` qui pose
 * `cancel_at`, et laisser le renouvellement appeler `finalizeCancellation()` au bon moment.
 */
export async function finalizeCancellation(
  tdb: TenantDb,
  subscriptionId: number
): Promise<Subscription> {
  const [updated] = await tdb.update(
    subscriptions,
    {
      status: 'canceled',
      updatedAt: new Date(),
    },
    eq(subscriptions.id, subscriptionId)
  );

  return updated;
}
