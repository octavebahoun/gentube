import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  billingCycles,
  creditLedger,
  paymentAttempts,
  paymentIntents,
  paymentWebhookEvents,
} from '@/lib/db/schema';
import { getBalance } from '@/lib/credits';
import type { TenantDb } from '@/lib/db/tenant-db';
import { closeDb, createTenant, resetDb } from '@/lib/test/fixtures';
import {
  corpsDeRappel,
  entetesSignees,
  passerelleFactice,
  reglement,
} from '@/lib/test/paiement';
import { PaymentError, type PaymentGateway, type Settlement } from '@/lib/payments';
import { createSubscriptionCheckout, createTopupCheckout, getSubscription } from './checkout';
import { MAX_PAYMENT_ATTEMPTS, PLAN_OFFERS, TOPUP_PACKS_FOR_SALE } from './plans';
import { processPaymentWebhook } from './webhook';
import { reveillerLeTenant } from './reveil';

afterAll(async () => {
  await closeDb();
});

const BASE_URL = 'https://app.test';

/**
 * Livre un rappel signé.
 *
 * Le corps ne dit **pas** quel encaissement il concerne — c'est le cas SasPay,
 * et donc celui que le pipeline doit savoir traiter. Ce que la passerelle
 * répondra à la relecture est le seul levier du test.
 */
function livrer(
  gateway: PaymentGateway,
  {
    corps = corpsDeRappel('paid'),
    now = Date.now(),
    secret,
  }: { corps?: string; now?: number; secret?: string } = {}
) {
  return processPaymentWebhook(
    entetesSignees(corps, { now, ...(secret ? { secret } : {}) }),
    corps,
    { gateway, now }
  );
}

/** Une passerelle qui déclare tel règlement à la relecture. */
function passerelleQuiRepond(patch: Partial<Settlement> = {}) {
  return passerelleFactice({
    onSettle: async () => reglement(patch),
  });
}

function lignesDeRappel() {
  return db.select().from(paymentWebhookEvents);
}

async function ouvrirAbonnement(tdb: TenantDb, plan: string, reference: string) {
  return await createSubscriptionCheckout(tdb, plan, {
    gateway: passerelleFactice({ reference }).gateway,
    baseUrl: BASE_URL,
  });
}

describe('les paiements confirmés', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('accorde la dotation du plan et bascule le tenant dessus', async () => {
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.pro;
    await ouvrirAbonnement(tdb, 'pro', 'CS-SUB-1');

    const { gateway, relus } = passerelleQuiRepond({
      amountXof: offre.priceXof,
    });
    const rendu = await livrer(gateway);

    expect(rendu.outcome).toBe('credited');
    expect(rendu.status).toBe(200);
    // La relecture a bien porté sur NOTRE référence, jamais sur celle du corps.
    expect(relus).toEqual(['CS-SUB-1']);

    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
    expect((await getSubscription(tdb))?.status).toBe('active');

    const [intent] = await tdb.findMany(paymentIntents);
    expect(intent.status).toBe('succeeded');
    // La commission du prestataire, telle qu'il la chiffre lui-même.
    expect(intent.feesXof).toBe(488);
    expect(intent.netXof).toBe(15_000);

    const [cycle] = await tdb.findMany(billingCycles);
    expect(cycle.status).toBe('paid');
  });

  it('accorde une recharge sans toucher à l abonnement', async () => {
    const tdb = await createTenant('Alpha');
    const pack = TOPUP_PACKS_FOR_SALE[0];
    await createTopupCheckout(tdb, pack.id, {
      gateway: passerelleFactice({ reference: 'CS-TOP-1' }).gateway,
      baseUrl: BASE_URL,
    });

    const { gateway } = passerelleQuiRepond({ amountXof: pack.priceXof });
    expect((await livrer(gateway)).outcome).toBe('credited');

    expect(await getBalance(tdb)).toBe(pack.credits);
    expect(await getSubscription(tdb)).toBeNull();
    expect(await tdb.findMany(billingCycles)).toHaveLength(0);
  });
});

describe('les rappels forgés et rejoués', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('n écrit strictement rien quand la signature ne passe pas', async () => {
    // Écrire avant de vérifier offrirait à un inconnu une table à remplir.
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const corps = corpsDeRappel('paid');
    const rendu = await processPaymentWebhook(
      { ...entetesSignees(corps), 'x-webhook-signature': 'f'.repeat(64) },
      corps,
      { gateway: passerelleQuiRepond().gateway }
    );

    expect(rendu.status).toBe(401);
    expect(await lignesDeRappel()).toHaveLength(0);
    expect(await getBalance(tdb)).toBe(0);
  });

  it('refuse un rappel signé avec un autre secret', async () => {
    await createTenant('Alpha');
    const rendu = await livrer(passerelleQuiRepond().gateway, {
      secret: 'whsec_celui_d_un_autre',
    });

    expect(rendu.outcome).toBe('invalid_signature');
    expect(await lignesDeRappel()).toHaveLength(0);
  });

  it('refuse un rappel périmé, signature ou pas', async () => {
    // Rejouer un rappel d'il y a une heure ne doit rien rouvrir.
    await createTenant('Alpha');
    const now = Date.now();
    const corps = corpsDeRappel('paid');

    const rendu = await processPaymentWebhook(
      entetesSignees(corps, { now: now - 3_600_000 }),
      corps,
      { gateway: passerelleQuiRepond().gateway, now }
    );

    expect(rendu.status).toBe(401);
    expect(await lignesDeRappel()).toHaveLength(0);
  });

  it('ne crédite qu une fois quand le même événement est livré deux fois', async () => {
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.starter;
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ amountXof: offre.priceXof });
    const now = Date.now();
    const corps = corpsDeRappel('paid');

    expect((await livrer(gateway, { corps, now })).outcome).toBe('credited');
    // Même corps, même horodatage : même signature, donc même id d'événement.
    expect((await livrer(gateway, { corps, now })).outcome).toBe('duplicate');

    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
    expect(await tdb.findMany(creditLedger)).toHaveLength(1);
  });

  it('ne crédite qu une fois quand le paiement revient sous un nouvel id', async () => {
    /*
     * La garde d'idempotence du grand livre est dérivée de la référence de
     * paiement, pas de l'id d'événement : un rappel rejoué sous une nouvelle
     * signature tombe sur la même clé et ne bouge rien.
     */
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.starter;
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ amountXof: offre.priceXof });
    const now = Date.now();

    expect((await livrer(gateway, { now })).outcome).toBe('credited');
    // Une seconde plus tard : autre horodatage, autre signature, autre id.
    const second = await livrer(gateway, { now: now + 1_000 });

    expect(second.outcome).toBe('nothing_settled');
    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
    expect(await tdb.findMany(creditLedger)).toHaveLength(1);
    expect(await lignesDeRappel()).toHaveLength(2);
  });
});

describe('la passerelle a le dernier mot', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('ne crédite rien quand la relecture ne dit pas « payé »', async () => {
    /*
     * Le cœur du modèle : le corps du rappel annonce un succès, la passerelle
     * dit « en cours ». C'est elle qui fait autorité — et avec SasPay elle est
     * la seule source, puisque son rappel ne désigne aucun encaissement.
     */
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ status: 'pending' });
    const rendu = await livrer(gateway, { corps: corpsDeRappel('paid') });

    expect(rendu.outcome).toBe('nothing_settled');
    expect(await getBalance(tdb)).toBe(0);
  });

  it('ne crédite rien quand le montant réglé diffère de l intention', async () => {
    // Un montant qui ne correspond pas veut dire qu'on ne regarde pas le même
    // paiement. Créditer serait pire que de ne rien faire.
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ amountXof: 1 });
    expect((await livrer(gateway)).outcome).toBe('nothing_settled');
    expect(await getBalance(tdb)).toBe(0);

    const [intent] = await tdb.findMany(paymentIntents);
    // Laissé en attente, pas clos : l'argent est peut-être arrivé.
    expect(intent.status).toBe('pending');
  });

  it('ne crédite rien pour un règlement dans une autre devise', async () => {
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ currency: 'EUR' });
    expect((await livrer(gateway)).outcome).toBe('nothing_settled');
    expect(await getBalance(tdb)).toBe(0);
  });

  it('demande une redelivery quand la passerelle est illisible, puis crédite', async () => {
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.starter;
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    let tombe = true;
    const { gateway } = passerelleFactice({
      onSettle: async () => {
        if (tombe) throw new PaymentError('Gateway unavailable', { status: 504 });
        return reglement({ amountXof: offre.priceXof });
      },
    });

    /*
     * Une passerelle injoignable n'échoue pas le rappel : l'encaissement reste
     * en attente, et le réveil suivant le retrouve. C'est précisément ce qui
     * rend ce modèle robuste à un webhook perdu.
     */
    const premier = await livrer(gateway, { now: Date.now() });
    expect(premier.outcome).toBe('nothing_settled');
    expect(await getBalance(tdb)).toBe(0);

    tombe = false;
    const second = await livrer(gateway, { now: Date.now() + 2_000 });
    expect(second.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
  });

  it('accuse réception quand aucun encaissement en attente n a bougé', async () => {
    /*
     * Un rappel authentique peut concerner un encaissement d'un autre
     * environnement partageant le même compte marchand, ou arriver avant que
     * le payeur ait validé. Redélivrer n'y changerait rien : 200.
     */
    await createTenant('Alpha');
    const rendu = await livrer(passerelleQuiRepond().gateway);

    expect(rendu.status).toBe(200);
    expect(rendu.outcome).toBe('nothing_settled');
    expect(rendu.reveil).toMatchObject({ relus: 0, credites: 0 });
  });

  it('résout le tenant depuis notre ligne, jamais depuis la charge', async () => {
    /*
     * La charge SasPay ne porte aucun identifiant venant de nous — pas même un
     * tenant. Le rappel ci-dessous en invente un ; il ne doit avoir aucun
     * effet, parce que rien ne le lit.
     */
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    const offre = PLAN_OFFERS.starter;
    await ouvrirAbonnement(alpha, 'starter', 'CS-SUB-ALPHA');

    const { gateway } = passerelleQuiRepond({ amountXof: offre.priceXof });
    await livrer(gateway, {
      corps: JSON.stringify({
        event: 'transaction.success',
        data: { status: 'SUCCESS', tenant_id: beta.tenantId, amount: '999999' },
      }),
    });

    expect(await getBalance(alpha)).toBe(offre.monthlyCredits);
    expect(await getBalance(beta)).toBe(0);
  });
});

describe('les paiements échoués', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('enregistre l échec et passe l abonnement en impayé', async () => {
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ status: 'failed' });
    const rendu = await livrer(gateway, { corps: corpsDeRappel('failed') });

    expect(rendu.outcome).toBe('failed');
    expect(await getBalance(tdb)).toBe(0);
    expect((await getSubscription(tdb))?.status).toBe('past_due');

    const [intent] = await tdb.findMany(paymentIntents);
    expect(intent.status).toBe('failed');
    expect(intent.failureReason).toContain('failed');

    const [tentative] = await tdb.findMany(paymentAttempts);
    expect(tentative.status).toBe('failed');
  });

  it('distingue un abandon d un refus jusqu en base', async () => {
    // La relance ne se raconte pas pareil au client.
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ status: 'cancelled' });
    expect((await livrer(gateway, { corps: corpsDeRappel('cancelled') })).outcome).toBe(
      'failed'
    );

    const [intent] = await tdb.findMany(paymentIntents);
    expect(intent.status).toBe('cancelled');
  });

  it('suspend l abonnement une fois les réessais épuisés', async () => {
    const tdb = await createTenant('Alpha');
    const { gateway } = passerelleQuiRepond({ status: 'failed' });

    for (let essai = 0; essai < MAX_PAYMENT_ATTEMPTS; essai += 1) {
      await createSubscriptionCheckout(tdb, 'starter', {
        gateway: passerelleFactice({ reference: `CS-SUB-${essai}` }).gateway,
        baseUrl: BASE_URL,
      });
      await livrer(gateway, {
        corps: corpsDeRappel('failed'),
        now: Date.now() + essai * 2_000,
      });
    }

    expect((await getSubscription(tdb))?.status).toBe('suspended');
    const [cycle] = await tdb.findMany(billingCycles);
    expect(cycle.status).toBe('failed');
  });

  it('enregistre une recharge échouée, qui n a pas de cycle à clore', async () => {
    const tdb = await createTenant('Alpha');
    await createTopupCheckout(tdb, TOPUP_PACKS_FOR_SALE[0].id, {
      gateway: passerelleFactice({ reference: 'CS-TOP-1' }).gateway,
      baseUrl: BASE_URL,
    });

    const { gateway } = passerelleQuiRepond({ status: 'failed' });
    expect((await livrer(gateway, { corps: corpsDeRappel('failed') })).outcome).toBe(
      'failed'
    );

    expect(await getBalance(tdb)).toBe(0);
    const [intent] = await tdb.findMany(paymentIntents);
    expect(intent.status).toBe('failed');
    expect(await tdb.findMany(billingCycles)).toHaveLength(0);
  });

  it('crédite quand même si la passerelle dit « payé » sur un rappel d échec', async () => {
    /*
     * Le corps annonce un échec, la passerelle dit que l'argent est arrivé.
     * Marquer échoué ici bloquerait un tenant qui a payé — et le corps ne
     * désigne de toute façon aucun encaissement.
     */
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.starter;
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({ amountXof: offre.priceXof });
    const rendu = await livrer(gateway, { corps: corpsDeRappel('failed') });

    expect(rendu.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
  });
});

describe('les requêtes malformées', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('refuse un corps qui n est pas du JSON', async () => {
    const corps = 'pas du json du tout';
    const rendu = await processPaymentWebhook(
      entetesSignees(corps),
      corps,
      { gateway: passerelleQuiRepond().gateway }
    );

    expect(rendu.status).toBe(400);
    expect(rendu.outcome).toBe('unreadable_payload');
    expect(await lignesDeRappel()).toHaveLength(0);
  });

  it('journalise un type d événement sur lequel il n y a rien à faire', async () => {
    await createTenant('Alpha');
    const rendu = await livrer(passerelleQuiRepond().gateway, {
      corps: corpsDeRappel('pending'),
    });

    expect(rendu.status).toBe(200);
    expect(rendu.outcome).toBe('nothing_settled');

    const [ligne] = await lignesDeRappel();
    expect(ligne.eventType).toBe('transaction.created');
    expect(ligne.processedAt).not.toBeNull();
    // La charge est conservée verbatim pour le support et la réconciliation.
    expect(ligne.payload).toMatchObject({ event: 'transaction.created' });
  });

  it('marque la ligne traitée seulement quand le réveil a abouti', async () => {
    const tdb = await createTenant('Alpha');
    await ouvrirAbonnement(tdb, 'starter', 'CS-SUB-1');

    const { gateway } = passerelleQuiRepond({
      amountXof: PLAN_OFFERS.starter.priceXof,
    });
    await livrer(gateway);

    const [ligne] = await lignesDeRappel();
    expect(ligne.signatureValid).toBe(true);
    expect(ligne.processedAt).not.toBeNull();
    expect(ligne.processingError).toBeNull();
    expect(ligne.provider).toBe('test');
    // La référence reste nulle : la charge n'en porte aucune qui soit à nous.
    expect(ligne.gatewayReference).toBeNull();
  });
});

describe('le réveil trouve ce qu un rappel perdu aurait laissé', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rattrape un encaissement dont le rappel n est jamais arrivé', async () => {
    /*
     * C'est le bénéfice inattendu du modèle : un webhook perdu — un
     * déploiement au mauvais moment suffit — n'immobilise plus rien. Le
     * prochain réveil, quelle qu'en soit la cause, retrouve le paiement.
     */
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.pro;
    await ouvrirAbonnement(tdb, 'pro', 'CS-PERDU');

    // Aucun rappel n'est arrivé pour celui-ci. Un rappel sans rapport suffit.
    const { gateway } = passerelleQuiRepond({ amountXof: offre.priceXof });
    const rendu = await livrer(gateway);

    expect(rendu.outcome).toBe('credited');
    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
  });

  it('ne fait pas tomber les autres quand un encaissement est illisible', async () => {
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    await ouvrirAbonnement(alpha, 'starter', 'CS-CASSE');
    await ouvrirAbonnement(beta, 'starter', 'CS-SAIN');

    const { gateway } = passerelleFactice({
      onSettle: async (reference) => {
        if (reference === 'CS-CASSE') throw new PaymentError('boom');
        return reglement({ amountXof: PLAN_OFFERS.starter.priceXof });
      },
    });

    const rendu = await livrer(gateway);

    expect(rendu.outcome).toBe('credited');
    expect(rendu.reveil).toMatchObject({ credites: 1, enAttente: 1 });
    expect(await getBalance(beta)).toBe(PLAN_OFFERS.starter.monthlyCredits);
    expect(await getBalance(alpha)).toBe(0);

    // Celui qu'on n'a pas su lire reste en attente pour le réveil suivant.
    const [casse] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.gatewayReference, 'CS-CASSE'));
    expect(casse.status).toBe('pending');
  });
});

describe('le reveil declenche par le retour du payeur', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('credite celui qui revient sans attendre aucun rappel', async () => {
    /*
     * SasPay ne livre aucun webhook — verifie sur deux transactions reelles le
     * 5 septembre 2026, journal de livraison vide. Le retour du payeur est
     * alors le seul declencheur qui reste, et il doit suffire.
     */
    const tdb = await createTenant('Alpha');
    const offre = PLAN_OFFERS.pro;
    await ouvrirAbonnement(tdb, 'pro', 'CS-RETOUR');

    const { gateway } = passerelleFactice({
      onSettle: async () => reglement({ amountXof: offre.priceXof }),
    });

    const rendu = await reveillerLeTenant(gateway, tdb.tenantId);

    expect(rendu).toMatchObject({ relus: 1, credites: 1 });
    expect(await getBalance(tdb)).toBe(offre.monthlyCredits);
  });

  it('ne relit que ses propres encaissements', async () => {
    /*
     * Contrairement au reveil d'un rappel, qui arrive sans savoir de qui il
     * parle et doit donc balayer, un retour de paiement sait exactement qui
     * revient. Balayer quand meme ferait relire les encaissements des autres
     * clients a chaque affichage d'une page — invisible, mais c'est une
     * requete chez le prestataire par paiement d'autrui.
     */
    const alpha = await createTenant('Alpha');
    const beta = await createTenant('Beta');
    await ouvrirAbonnement(alpha, 'starter', 'CS-ALPHA');
    await ouvrirAbonnement(beta, 'starter', 'CS-BETA');

    const { gateway, relus } = passerelleFactice({
      onSettle: async () => reglement({ amountXof: PLAN_OFFERS.starter.priceXof }),
    });

    await reveillerLeTenant(gateway, alpha.tenantId);

    expect(relus).toEqual(['CS-ALPHA']);
    expect(await getBalance(beta)).toBe(0);
  });

  it('ne va pas chercher la passerelle quand il n y a rien en attente', async () => {
    // La page de facturation s'affiche a chaque visite : sans ce court-circuit,
    // chaque retour deja traite couterait une requete pour rien.
    const tdb = await createTenant('Alpha');
    const { gateway, relus } = passerelleFactice();

    expect(await reveillerLeTenant(gateway, tdb.tenantId)).toMatchObject({
      relus: 0,
      credites: 0,
    });
    expect(relus).toEqual([]);
  });
});
