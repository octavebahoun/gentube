import { and, eq } from 'drizzle-orm';
import type { tenantDb } from '@/lib/db/tenant-db';
import {
  billingCycles,
  paymentAttempts,
  paymentIntents,
  subscriptions,
  type PaymentIntent,
} from '@/lib/db/schema';
import { grantCredits } from '@/lib/credits';
import type { Settlement } from '@/lib/payments';
import { MAX_PAYMENT_ATTEMPTS } from './plans';

/**
 * Ce qu'un encaissement fait à nos tables, une fois la passerelle interrogée.
 *
 * **Rien ici ne connaît le prestataire.** Le seul objet qui entre est un
 * `Settlement`, c'est-à-dire ce que la passerelle a répondu quand on lui a
 * demandé où en était l'argent — jamais un corps de webhook. C'est ce qui a
 * permis de remplacer GeniusPay par SasPay sans toucher une ligne de ce
 * fichier-ci : la règle du métier n'a pas changé, seule la façon de
 * l'interroger.
 */

type Tdb = ReturnType<typeof tenantDb>;

/**
 * Accorde ce qui a été payé, en une transaction : l'intention, les crédits,
 * et — pour un abonnement — le cycle, la période d'abonnement et le plan du
 * tenant. Le plan change ici et nulle part ailleurs : ni au checkout, ni sur
 * le seul callback.
 */
export async function crediterLePaiement(
  tdb: Tdb,
  intent: PaymentIntent,
  settlement: Settlement,
  { provider, reference }: { provider: string; reference: string }
): Promise<void> {
  await tdb.transaction(async (tx) => {
    await tx.update(
      paymentIntents,
      {
        status: 'succeeded',
        gatewayStatus: settlement.status,
        // La commission telle que le prestataire la chiffre, transaction par
        // transaction. C'est le seul poste de coût de la plateforme qu'un
        // fournisseur donne lui-même : le jeter serait retomber dans
        // l'estimation (`docs/etude-des-couts.md` §2.4).
        feesXof: settlement.feeXof,
        netXof: settlement.netXof,
        succeededAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    if (intent.creditsGranted > 0) {
      await grantCredits(tx, {
        amount: intent.creditsGranted,
        reason: intent.kind === 'subscription' ? 'subscription_grant' : 'topup',
        // Clé sur le paiement, pas l'événement : une redelivery sous un nouvel
        // id d'événement résout vers la même clé et ne bouge rien. Le
        // prestataire est dans la clé pour qu'une bascule ne fasse jamais
        // collisionner deux références homonymes.
        idempotencyKey: `${provider}:payment:${reference}`,
      });
    }

    if (intent.kind !== 'subscription' || !intent.billingCycleId) return;

    const cycle = await tx.findById(billingCycles, intent.billingCycleId);
    if (!cycle) return;

    await tx.update(
      billingCycles,
      { status: 'paid', paidAt: new Date(), updatedAt: new Date() },
      eq(billingCycles.id, cycle.id)
    );

    await tx.update(
      paymentAttempts,
      { status: 'succeeded', error: null, updatedAt: new Date() },
      eq(paymentAttempts.paymentIntentId, intent.id)
    );

    await tx.update(
      subscriptions,
      {
        status: 'active',
        currentPeriodStart: cycle.periodStart,
        currentPeriodEnd: cycle.periodEnd,
        updatedAt: new Date(),
      },
      eq(subscriptions.id, cycle.subscriptionId)
    );
  });
}

/**
 * Enregistre un encaissement qui n'aboutira pas.
 *
 * Un abandon du payeur n'est pas un refus du réseau : `cancelled` et `failed`
 * restent distincts jusqu'en base, parce que la relance ne se raconte pas
 * pareil au client.
 */
export async function enregistrerLechec(
  tdb: Tdb,
  intent: PaymentIntent,
  settlement: Settlement,
  raison: string
): Promise<void> {
  const status = settlement.status === 'cancelled' ? 'cancelled' : 'failed';

  await tdb.transaction(async (tx) => {
    await tx.update(
      paymentIntents,
      {
        status,
        gatewayStatus: settlement.status,
        failureReason: raison,
        failedAt: new Date(),
        updatedAt: new Date(),
      },
      eq(paymentIntents.id, intent.id)
    );

    if (!intent.billingCycleId) return;

    await tx.update(
      paymentAttempts,
      { status: 'failed', error: raison, updatedAt: new Date() },
      eq(paymentAttempts.paymentIntentId, intent.id)
    );

    const echecs = await tx.count(
      paymentAttempts,
      and(
        eq(paymentAttempts.billingCycleId, intent.billingCycleId),
        eq(paymentAttempts.status, 'failed')
      )
    );

    const cycle = await tx.findById(billingCycles, intent.billingCycleId);
    if (!cycle) return;

    // Réessais épuisés (cahier des charges §3.A) : clore le cycle et stopper
    // le renouvellement. Le tenant garde son solde.
    if (echecs >= MAX_PAYMENT_ATTEMPTS) {
      await tx.update(
        billingCycles,
        { status: 'failed', updatedAt: new Date() },
        eq(billingCycles.id, cycle.id)
      );
      await tx.update(
        subscriptions,
        { status: 'suspended', updatedAt: new Date() },
        eq(subscriptions.id, cycle.subscriptionId)
      );
      return;
    }

    await tx.update(
      subscriptions,
      { status: 'past_due', updatedAt: new Date() },
      eq(subscriptions.id, cycle.subscriptionId)
    );
  });
}
