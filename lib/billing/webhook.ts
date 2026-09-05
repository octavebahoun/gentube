import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { paymentWebhookEvents } from '@/lib/db/schema';
import {
  createPaymentGateway,
  type CallbackEvent,
  type PaymentGateway,
} from '@/lib/payments';
import { reveiller, reveillerUn, type ReveilResult } from './reveil';

/**
 * Rappels entrants du prestataire de paiement — le seul endroit où un paiement
 * devient des crédits.
 *
 * Ordre du pipeline, et pourquoi :
 *
 *  1. vérifier la signature          — 401 et **PAS UNE LIGNE ÉCRITE**
 *  2. lire l'événement               — un corps illisible n'atteint jamais Postgres
 *  3. journaliser, unique sur l'id d'événement — garde d'idempotence, piste d'audit
 *  4. réveiller                      — relire chez la passerelle, elle fait autorité
 *
 * L'étape 1 avant l'étape 3 est délibérée : écrire avant de vérifier offre à un
 * appelant non authentifié une table à remplir. Signature d'abord signifie
 * qu'un rappel forgé ne laisse rien derrière lui.
 *
 * **L'étape 4 ne fait jamais confiance au corps reçu.** Le rappel dit « va
 * voir » ; c'est `settle()` qui dit ce qui s'est passé. Cette règle valait déjà
 * par prudence ; avec SasPay elle est obligatoire, puisque sa charge ne porte
 * aucun identifiant venant de nous — voir `lib/billing/reveil.ts`.
 *
 * Un événement vérifié qui échoue plus loin reste avec `processed_at` à null,
 * donc une redelivery peut repartir — tandis que la clé d'idempotence du grand
 * livre, dérivée de la référence de paiement plutôt que de l'id d'événement,
 * empêche un second succès de créditer deux fois.
 */

export type WebhookOutcome = {
  status: number;
  body: { ok: boolean; message: string };
  /** Décision lisible par machine, pour les tests et les logs. */
  outcome: string;
  /** Ce que le réveil a tranché, quand il a eu lieu. */
  reveil?: ReveilResult;
};

export type ProcessWebhookOptions = {
  /** Injectable pour les tests ; la production la construit depuis l'environnement. */
  gateway?: PaymentGateway;
  ip?: string | null;
  now?: number;
};

function reply(
  status: number,
  outcome: string,
  message: string,
  reveil?: ReveilResult
): WebhookOutcome {
  return { status, body: { ok: status < 400, message }, outcome, reveil };
}

/**
 * Écritures sans scope : uniquement dans ce fichier.
 *
 * Un rappel arrive sans session et sans tenant. Le journal des événements est
 * une table de plateforme, pas une donnée de client ; le tenant, lui, est ce
 * que le réveil *résout*, et chaque écriture qui le touche repasse par
 * `tenantDb`.
 */
async function annoterLevenement(
  id: number,
  patch: {
    processedAt?: Date | null;
    processingError?: string | null;
    tenantId?: number | null;
  }
): Promise<void> {
  await db
    .update(paymentWebhookEvents)
    .set(patch)
    .where(eq(paymentWebhookEvents.id, id));
}

export async function processPaymentWebhook(
  headers: Record<string, string>,
  rawBody: string,
  options: ProcessWebhookOptions = {}
): Promise<WebhookOutcome> {
  const gateway = options.gateway ?? createPaymentGateway();
  const now = options.now ?? Date.now();

  // --- 1. Rien n'est écrit avant que la signature passe. ---
  if (!gateway.verifyCallback({ headers, rawBody, now })) {
    return reply(401, 'invalid_signature', 'Invalid or stale signature.');
  }

  // --- 2. Lire l'événement. ---
  let evenement: CallbackEvent;
  try {
    evenement = gateway.readCallback(rawBody, headers);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unreadable';
    return reply(400, 'unreadable_payload', message);
  }

  // --- 3. Journaliser. ---
  let charge: unknown = null;
  try {
    charge = JSON.parse(rawBody);
  } catch {
    charge = null;
  }

  const [insere] = await db
    .insert(paymentWebhookEvents)
    .values({
      provider: gateway.provider,
      eventId: evenement.eventId,
      eventType: evenement.name,
      gatewayReference: evenement.reference,
      payload: charge,
      signatureValid: true,
      receivedFromIp: options.ip ?? null,
    })
    .onConflictDoNothing({
      target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventId],
    })
    .returning();

  let ligne = insere ?? null;
  if (!ligne) {
    const [existante] = await db
      .select()
      .from(paymentWebhookEvents)
      .where(
        and(
          eq(paymentWebhookEvents.provider, gateway.provider),
          eq(paymentWebhookEvents.eventId, evenement.eventId)
        )
      )
      .limit(1);

    if (existante?.processedAt) {
      return reply(200, 'duplicate', 'Event already processed.');
    }
    ligne = existante ?? null;
    if (!ligne) {
      // Perdu la course à l'insert et la ligne introuvable : laisser le
      // prestataire réessayer.
      return reply(409, 'event_row_missing', 'Concurrent delivery, retry.');
    }
  }

  // --- 4. Réveiller. ---
  /*
   * Deux chemins, et c'est le contrat qui choisit — pas une convention. Un
   * prestataire dont le rappel porte notre clé mène droit au but ; SasPay, dont
   * la charge ne porte rien de nous, oblige à relire toute la file en attente.
   *
   * Se tromper de chemin ne lèverait aucune erreur : on chercherait simplement
   * une référence introuvable, et le client paierait sans être crédité.
   */
  let resultat: ReveilResult;
  try {
    resultat =
      gateway.callbackIdentifies === 'reference' && evenement.reference
        ? await reveillerUn(gateway, evenement.reference)
        : await reveiller(gateway);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown error';
    await annoterLevenement(ligne.id, { processingError: `reveil: ${message}` });
    // 502, pas 200 : rien n'a été décidé, le prestataire doit redélivrer.
    // `processed_at` reste null, ce qui laisse la redelivery refaire le travail.
    return reply(502, 'reveil_failed', 'Could not re-read pending payments.');
  }

  await annoterLevenement(ligne.id, {
    processedAt: new Date(),
    processingError: null,
  });

  if (resultat.credites > 0) {
    return reply(
      200,
      'credited',
      `${resultat.credites} payment(s) confirmed and credits granted.`,
      resultat
    );
  }

  if (resultat.echoues > 0) {
    return reply(200, 'failed', `${resultat.echoues} payment(s) closed.`, resultat);
  }

  /*
   * Rien n'a bougé, et ce n'est pas une anomalie. Un `transaction.created`
   * arrive avant que le payeur ait validé quoi que ce soit ; un rappel peut
   * aussi concerner un encaissement d'un autre environnement partageant le
   * même compte marchand. Dans les deux cas, redélivrer n'y changerait rien —
   * d'où le 200.
   */
  return reply(200, 'nothing_settled', 'No pending payment has moved.', resultat);
}
