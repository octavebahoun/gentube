import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenantDb } from '@/lib/db/tenant-db';
import { paymentIntents, type PaymentIntent } from '@/lib/db/schema';
import { CURRENCY, type PaymentGateway, type Settlement } from '@/lib/payments';
import { crediterLePaiement, enregistrerLechec } from './resolution';

/**
 * Le réveil : relire nos encaissements en attente quand le prestataire fait
 * signe.
 *
 * **Pourquoi il existe.** SasPay signe et livre ses rappels, mais leur charge
 * ne porte **aucun identifiant venant de nous** — ni métadonnées, ni id de
 * session, seulement une référence de transaction qu'il a générée et que nous
 * n'avons jamais vue. Il n'y a donc aucun chemin de son rappel vers
 * l'abonnement à créditer.
 *
 * Plutôt que de deviner, on pousse jusqu'au bout la règle que le pipeline
 * appliquait déjà : **la passerelle fait autorité, jamais un corps de
 * webhook.** Le rappel devient un simple réveil ; ce sont nos propres lignes
 * `payment_intents` qui disent quoi relire, et `settle()` qui dit ce qui s'est
 * passé.
 *
 * **Ce que ça coûte.** Une requête par encaissement en attente, à chaque
 * rappel. C'est borné par `PLAFOND` et par le fait qu'un encaissement quitte
 * l'attente dès qu'il aboutit : la file ne contient que des paiements
 * réellement en cours.
 *
 * **Ce que ça rapporte.** Le réveil marche aussi sans rappel du tout. Un
 * webhook perdu — un déploiement au mauvais moment suffit — n'immobilise plus
 * rien : le prochain réveil, quelle qu'en soit la cause, retrouve le paiement.
 * C'est précisément la reprise qui manque du côté vidéo.
 */

/**
 * Combien d'encaissements en attente on relit d'un coup.
 *
 * Assez large pour couvrir une file normale, assez étroit pour qu'un incident
 * — cent cycles bloqués en attente — ne transforme pas un rappel en rafale de
 * requêtes chez le prestataire, qui plafonne à 300 par minute.
 */
export const PLAFOND = 25;

export type ReveilResult = {
  /** Encaissements relus auprès de la passerelle. */
  relus: number;
  /** Crédités : la passerelle confirme que l'argent est arrivé. */
  credites: number;
  /** Clos en échec, abandon compris. */
  echoues: number;
  /** Toujours en cours, ou laissés tels quels faute de pouvoir décider. */
  enAttente: number;
};

/**
 * Les encaissements qui peuvent encore bouger.
 *
 * `created` autant que `pending` : une intention dont le checkout a été ouvert
 * mais dont la mise à jour de statut a échoué reste `created` alors que le
 * payeur, lui, a bien reçu une URL. L'exclure laisserait ces paiements-là
 * définitivement orphelins.
 *
 * Lecture sans scope, comme le pipeline de webhook : un rappel arrive sans
 * session et sans tenant, et c'est justement le tenant qu'on résout ici. Toute
 * écriture repasse ensuite par `tenantDb`.
 */
async function enAttente(): Promise<PaymentIntent[]> {
  return await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        inArray(paymentIntents.status, ['created', 'pending']),
        isNotNull(paymentIntents.gatewayReference)
      )
    )
    .orderBy(paymentIntents.id)
    .limit(PLAFOND);
}

/**
 * Ce qui interdit de créditer, même quand la passerelle dit « payé ».
 *
 * Un montant qui ne correspond pas est le signal qu'on n'est pas en train de
 * regarder le même paiement — ou que quelque chose s'est passé qu'on ne
 * comprend pas. Dans les deux cas, créditer serait pire que de ne rien faire.
 */
function refuseDeCrediter(
  intent: PaymentIntent,
  settlement: Settlement
): string | null {
  if (settlement.currency && settlement.currency.toUpperCase() !== CURRENCY) {
    return `currency_mismatch: ${settlement.currency}`;
  }
  if (settlement.amountXof === null) {
    return 'amount_unknown';
  }
  if (settlement.amountXof !== intent.amountXof) {
    return `amount_mismatch: gateway ${settlement.amountXof}, intent ${intent.amountXof}`;
  }
  return null;
}

/**
 * Relit les encaissements en attente et tranche ceux qui ont bougé.
 *
 * Une passerelle injoignable sur l'un d'eux ne fait pas tomber les autres :
 * chaque encaissement est indépendant, et celui qu'on n'a pas pu lire reste en
 * attente pour le réveil suivant.
 */
export async function reveiller(
  gateway: PaymentGateway,
  { intents }: { intents?: PaymentIntent[] } = {}
): Promise<ReveilResult> {
  const file = intents ?? (await enAttente());
  const resultat: ReveilResult = {
    relus: 0,
    credites: 0,
    echoues: 0,
    enAttente: 0,
  };

  for (const intent of file) {
    const reference = intent.gatewayReference;
    if (!reference) continue;

    let settlement: Settlement;
    try {
      settlement = await gateway.settle(reference);
      resultat.relus += 1;
    } catch (cause) {
      // Ne pas savoir n'est pas savoir que c'est raté. On laisse l'intention
      // en attente : le prochain réveil réessaiera.
      console.error(
        `Could not re-read payment ${reference} at ${gateway.provider}:`,
        cause
      );
      resultat.enAttente += 1;
      continue;
    }

    if (settlement.status === 'pending') {
      resultat.enAttente += 1;
      continue;
    }

    const tdb = tenantDb(intent.tenantId);

    if (settlement.status === 'paid') {
      const refus = refuseDeCrediter(intent, settlement);
      if (refus) {
        // Bruyant volontairement : de l'argent est arrivé chez le prestataire
        // sans qu'on sache à quoi le rattacher. C'est un incident, pas un cas
        // limite — et personne ne le verrait dans un journal muet.
        console.error(
          `CRITICAL: paid settlement ${reference} not credited — ${refus}.`
        );
        resultat.enAttente += 1;
        continue;
      }

      await crediterLePaiement(tdb, intent, settlement, {
        provider: gateway.provider,
        reference,
      });
      resultat.credites += 1;
      continue;
    }

    await enregistrerLechec(
      tdb,
      intent,
      settlement,
      `${gateway.provider} reports ${settlement.status}`
    );
    resultat.echoues += 1;
  }

  return resultat;
}

/**
 * Le réveil ciblé, pour un prestataire dont le rappel dit de qui il parle.
 *
 * SasPay n'en fait pas partie, mais le contrat prévoit le cas
 * (`callbackIdentifies: 'reference'`) et il coûte quinze lignes : le jour où un
 * prestataire porte notre clé, on va droit au but au lieu de balayer.
 */
export async function reveillerUn(
  gateway: PaymentGateway,
  reference: string
): Promise<ReveilResult> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.gatewayReference, reference))
    .limit(1);

  if (!intent) return { relus: 0, credites: 0, echoues: 0, enAttente: 0 };
  return await reveiller(gateway, { intents: [intent] });
}

/**
 * Le réveil déclenché par le retour du payeur.
 *
 * Le `return_url` ramène le client sur sa page de facturation quelques
 * secondes après qu'il a validé : c'est le déclencheur le plus rapide dont on
 * dispose, et il ne coûte rien. Il rend le crédit immédiat pour le cas normal
 * — celui où le client revient — sans rien attendre du prestataire.
 *
 * Restreint à **son** tenant, contrairement au réveil d'un rappel. Un rappel
 * arrive sans savoir de qui il parle et doit donc balayer ; un retour de
 * paiement, lui, sait exactement qui revient. Balayer quand même ferait relire
 * les encaissements d'autres clients à chaque affichage d'une page.
 */
export async function reveillerLeTenant(
  gateway: PaymentGateway,
  tenantId: number
): Promise<ReveilResult> {
  const intents = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.tenantId, tenantId),
        inArray(paymentIntents.status, ['created', 'pending']),
        isNotNull(paymentIntents.gatewayReference)
      )
    )
    .orderBy(paymentIntents.id)
    .limit(PLAFOND);

  if (intents.length === 0) {
    return { relus: 0, credites: 0, echoues: 0, enAttente: 0 };
  }
  return await reveiller(gateway, { intents });
}
