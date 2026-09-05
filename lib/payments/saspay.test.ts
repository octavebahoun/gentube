import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentError, PaymentNotConfiguredError } from './contract';
import { SasPayGateway, isSasPayConfigured, sasPayConfig } from './saspay';

const CONFIG = {
  environment: 'sandbox' as const,
  apiKey: 'sk_test_abc',
  webhookSecret: 'whsec_saspay',
  baseUrl: 'https://api.saspay.me/api/v1',
};

const CLIENT = {
  name: 'Awa Sossou',
  email: 'awa@example.bj',
  phone: '22990000000',
};

/** Une session telle que leur doc la rend : à plat, montants en chaîne. */
const SESSION = {
  id: 'c9a17e2c-4b1a-4f0e-9c3d-2a1b3c4d5e6f',
  checkout_url: 'https://pay.saspay.me/checkout/kZ2v9rT4bQxL8mNpYw==',
  amount: '15000.00',
  currency: 'XOF',
  status: 'PENDING',
  transaction: null,
};

function repond(...reponses: Array<{ body: unknown; status?: number }>) {
  const appel = vi.fn();
  for (const { body, status = 200 } of reponses) {
    appel.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as unknown as Response);
  }
  return appel;
}

let origine: typeof globalThis.fetch;
const VARS = [
  'SASPAY_ENV',
  'SASPAY_SANDBOX_API_KEY',
  'SASPAY_SANDBOX_WEBHOOK_SECRET',
  'SASPAY_LIVE_API_KEY',
  'SASPAY_LIVE_WEBHOOK_SECRET',
] as const;

beforeEach(() => {
  origine = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = origine;
  for (const nom of VARS) process.env[nom] = '';
});

describe('ouvrir un encaissement', () => {
  it('poste le corps que leur schéma décrit', async () => {
    const appel = repond({ body: SESSION, status: 201 });
    globalThis.fetch = appel;

    const ouvert = await new SasPayGateway(CONFIG).openCheckout({
      amountXof: 15_000,
      description: 'Abonnement Starter',
      returnUrl: 'https://gentube.app/merci',
      customer: CLIENT,
    });

    const [url, init] = appel.mock.calls[0];
    expect(url).toBe('https://api.saspay.me/api/v1/checkout-sessions/');
    expect(init.headers.Authorization).toBe('Bearer sk_test_abc');

    expect(JSON.parse(init.body)).toMatchObject({
      // Chaîne décimale : c'est ce que leur schéma demande. Le franc CFA n'a
      // pas de centimes, d'où le `.00` constant.
      amount: '15000.00',
      currency: 'XOF',
      country: 'BJ',
      customer_name: CLIENT.name,
      customer_email: CLIENT.email,
      customer_phone: CLIENT.phone,
      return_url: 'https://gentube.app/merci',
    });

    // L'id de session est ce qu'on stocke : c'est la seule clé qui nous
    // appartienne, puisque leur rappel n'en porte aucune.
    expect(ouvert.reference).toBe(SESSION.id);
    expect(ouvert.checkoutUrl).toBe(SESSION.checkout_url);
  });

  it('refuse un montant qui n est pas un entier de francs', async () => {
    const appel = repond({ body: SESSION });
    globalThis.fetch = appel;
    const passerelle = new SasPayGateway(CONFIG);

    for (const montant of [15_000.5, 0, -100]) {
      await expect(
        passerelle.openCheckout({
          amountXof: montant,
          description: 'x',
          returnUrl: 'https://gentube.app/merci',
          customer: CLIENT,
        })
      ).rejects.toThrow(/positive whole XOF/);
    }
    // Rien n'est parti : un montant douteux ne doit pas atteindre la passerelle.
    expect(appel).not.toHaveBeenCalled();
  });

  it('refuse une session sans URL, même annoncée réussie', async () => {
    // Il n'y a nulle part où envoyer le payeur. La traiter comme un succès
    // laisserait un cycle « en attente » mort derrière elle.
    globalThis.fetch = repond({ body: { ...SESSION, checkout_url: '' } });

    await expect(
      new SasPayGateway(CONFIG).openCheckout({
        amountXof: 15_000,
        description: 'x',
        returnUrl: 'https://gentube.app/merci',
        customer: CLIENT,
      })
    ).rejects.toThrow(/no id or checkout URL/);
  });
});

describe('relire un encaissement', () => {
  it('ne lit que la session tant qu aucune transaction n existe', async () => {
    // Tant que le payeur n'a rien validé, il n'y a pas de transaction : la
    // seconde requête serait un 404 garanti.
    const appel = repond({ body: SESSION });
    globalThis.fetch = appel;

    const etat = await new SasPayGateway(CONFIG).settle(SESSION.id);

    expect(appel).toHaveBeenCalledTimes(1);
    expect(etat.status).toBe('pending');
    expect(etat.amountXof).toBe(15_000);
    expect(etat.transactionId).toBeNull();
  });

  it('lit la transaction et garde le détail des commissions', async () => {
    /*
     * C'est le seul poste de coût qu'un fournisseur chiffre lui-même. Le jeter
     * serait retomber dans l'estimation — voir docs/etude-des-couts.md §2.4.
     */
    const appel = repond(
      { body: { ...SESSION, status: 'SUCCESS', transaction: 'txn-1' } },
      {
        body: {
          id: 'txn-1',
          status: 'SUCCESS',
          requested_amount: '15000.00',
          debited_amount: '15487.50',
          net_amount: '15000.00',
          client_fee: '487.50',
          gateway_fee: '0.00',
          platform_fee: '0.00',
          currency: 'XOF',
          fee_charge_mode: 'ADD_ON',
        },
      }
    );
    globalThis.fetch = appel;

    const etat = await new SasPayGateway(CONFIG).settle(SESSION.id);

    expect(appel.mock.calls[1][0]).toBe(
      'https://api.saspay.me/api/v1/payments/txn-1/verify/'
    );
    expect(etat.status).toBe('paid');
    expect(etat.amountXof).toBe(15_000);
    expect(etat.feeXof).toBe(488);
    expect(etat.chargedXof).toBe(15_488);
    expect(etat.netXof).toBe(15_000);
    expect(etat.transactionId).toBe('txn-1');
  });

  it('distingue un abandon d un refus', async () => {
    // Un payeur qui renonce n'est pas un réseau qui refuse : la relance ne se
    // raconte pas pareil au client.
    globalThis.fetch = repond(
      { body: { ...SESSION, transaction: 't' } },
      { body: { status: 'CANCELLED' } }
    );
    expect((await new SasPayGateway(CONFIG).settle('s')).status).toBe('cancelled');

    globalThis.fetch = repond(
      { body: { ...SESSION, transaction: 't' } },
      { body: { status: 'FAILED' } }
    );
    expect((await new SasPayGateway(CONFIG).settle('s')).status).toBe('failed');
  });

  it('garde en attente un état qu on ne connaît pas', async () => {
    // Un nom ajouté par le prestataire ne doit pas transformer un paiement en
    // cours en échec définitif.
    globalThis.fetch = repond({ body: { ...SESSION, status: 'AWAITING_OTP' } });
    expect((await new SasPayGateway(CONFIG).settle('s')).status).toBe('pending');
  });

  it('accepte les deux formes de réponse de leur API', async () => {
    // Leur introduction décrit une enveloppe { success, data }, leurs exemples
    // de paiement rendent l'objet à plat. Parier sur l'une rendrait undefined
    // partout, en silence.
    globalThis.fetch = repond({ body: { success: true, data: SESSION } });
    expect((await new SasPayGateway(CONFIG).settle('s')).amountXof).toBe(15_000);
  });
});

describe('les erreurs de la passerelle', () => {
  it('garde le sens des codes qui demandent une action différente', async () => {
    for (const code of [401, 429, 422]) {
      globalThis.fetch = repond({ body: { message: 'non' }, status: code });
      await expect(new SasPayGateway(CONFIG).settle('s')).rejects.toMatchObject({
        statusCode: code,
      });
    }
  });

  it('dit franchement quand SasPay est injoignable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(new SasPayGateway(CONFIG).settle('s')).rejects.toThrow(
      /unreachable/
    );
  });
});

describe('la signature d un rappel', () => {
  const CORPS = JSON.stringify({
    event: 'transaction.success',
    data: { id: '7c1a', status: 'SUCCESS' },
  });

  function entetes(now: number, corps = CORPS, secret = CONFIG.webhookSecret) {
    const timestamp = String(Math.floor(now / 1000));
    return {
      'x-webhook-timestamp': timestamp,
      'x-webhook-event': 'transaction.success',
      'x-webhook-signature': createHmac('sha256', secret)
        .update(`${timestamp}.${corps}`)
        .digest('hex'),
    };
  }

  it('accepte un rappel authentique', () => {
    const now = Date.now();
    expect(
      new SasPayGateway(CONFIG).verifyCallback({
        headers: entetes(now),
        rawBody: CORPS,
        now,
      })
    ).toBe(true);
  });

  it('refuse un corps modifié d un octet', () => {
    const now = Date.now();
    expect(
      new SasPayGateway(CONFIG).verifyCallback({
        headers: entetes(now),
        rawBody: CORPS.replace('SUCCESS', 'SUCCESa'),
        now,
      })
    ).toBe(false);
  });

  it('refuse un rappel périmé, même authentique', () => {
    // Rejouer un rappel d'il y a une heure ne doit rien rouvrir.
    const now = Date.now();
    expect(
      new SasPayGateway(CONFIG).verifyCallback({
        headers: entetes(now - 3_600_000),
        rawBody: CORPS,
        now,
      })
    ).toBe(false);
  });

  it('refuse un autre secret, et un rappel sans signature', () => {
    const now = Date.now();
    const passerelle = new SasPayGateway(CONFIG);

    expect(
      passerelle.verifyCallback({
        headers: entetes(now, CORPS, 'autre-secret'),
        rawBody: CORPS,
        now,
      })
    ).toBe(false);

    expect(
      passerelle.verifyCallback({
        headers: { 'x-webhook-timestamp': String(Math.floor(now / 1000)) },
        rawBody: CORPS,
        now,
      })
    ).toBe(false);
  });
});

describe('lire un rappel', () => {
  it('ne prétend pas savoir quel encaissement il concerne', () => {
    /*
     * Le point qui a décidé de l'architecture : leur charge ne porte aucun
     * identifiant venant de nous. S'en servir ferait chercher une clé qui
     * n'existe pas chez nous — et le client paierait sans être crédité.
     */
    const evenement = new SasPayGateway(CONFIG).readCallback(
      JSON.stringify({
        event: 'transaction.success',
        data: { id: '7c1a', reference: 'TXN-2026-000456', status: 'SUCCESS' },
      }),
      { 'x-webhook-signature': 'abc123' }
    );

    expect(evenement.reference).toBeNull();
    expect(evenement.name).toBe('transaction.success');
    expect(evenement.status).toBe('paid');
  });

  it('dérive un id d événement stable de la signature', () => {
    // Ils n'en fournissent pas, et l'unicité en base en demande un : deux
    // livraisons du même événement doivent tomber sur la même valeur.
    const passerelle = new SasPayGateway(CONFIG);
    const corps = JSON.stringify({ event: 'transaction.failed', data: {} });
    const entetes = { 'x-webhook-signature': 'deadbeef' };

    expect(passerelle.readCallback(corps, entetes).eventId).toBe('sig:deadbeef');
    expect(passerelle.readCallback(corps, entetes).eventId).toBe(
      passerelle.readCallback(corps, entetes).eventId
    );
  });

  it('refuse un corps illisible', () => {
    const passerelle = new SasPayGateway(CONFIG);
    expect(() => passerelle.readCallback('pas du json', {})).toThrow(PaymentError);
    expect(() => passerelle.readCallback('{}', {})).toThrow(/no event name/);
  });
});

describe('la configuration', () => {
  it('exige la clé et le secret de l environnement choisi', () => {
    expect(() => sasPayConfig()).toThrow(PaymentNotConfiguredError);
    expect(() => sasPayConfig()).toThrow(/SASPAY_SANDBOX_API_KEY/);

    process.env.SASPAY_SANDBOX_API_KEY = 'sk_test_abc';
    expect(() => sasPayConfig()).toThrow(/SASPAY_SANDBOX_WEBHOOK_SECRET/);
  });

  it('refuse une clé du mauvais environnement', () => {
    /*
     * Rien ne distingue à l'œil une clé de test d'une clé réelle, sauf son
     * préfixe. Une `sk_live_` posée sous SANDBOX encaisserait de l'argent réel
     * en croyant tester ; l'inverse ne encaisserait rien en production.
     */
    process.env.SASPAY_SANDBOX_API_KEY = 'sk_live_reelle';
    process.env.SASPAY_SANDBOX_WEBHOOK_SECRET = 'whsec';

    expect(() => sasPayConfig()).toThrow(/expected a sk_test_… key/);
    expect(isSasPayConfigured()).toBe(false);
  });

  it('se construit quand tout est en place', () => {
    process.env.SASPAY_ENV = 'live';
    process.env.SASPAY_LIVE_API_KEY = 'sk_live_reelle';
    process.env.SASPAY_LIVE_WEBHOOK_SECRET = 'whsec';

    const config = sasPayConfig();
    expect(config.environment).toBe('live');
    expect(config.baseUrl).toBe('https://api.saspay.me/api/v1');
    expect(isSasPayConfigured()).toBe(true);
  });
});
