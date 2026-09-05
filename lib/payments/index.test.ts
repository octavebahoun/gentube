import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_PROVIDER,
  PAYMENT_PROVIDERS,
  PaymentNotConfiguredError,
  createGatewayFor,
  createPaymentGateway,
  isBillingConfigured,
  paymentProviderFor,
} from './index';

const VARS = [
  'PAYMENT_PROVIDER',
  'SASPAY_ENV',
  'SASPAY_SANDBOX_API_KEY',
  'SASPAY_SANDBOX_WEBHOOK_SECRET',
] as const;

afterEach(() => {
  for (const nom of VARS) process.env[nom] = '';
});

describe('qui encaisse', () => {
  it('prend SasPay par défaut', () => {
    expect(paymentProviderFor()).toBe('saspay');
    expect(DEFAULT_PAYMENT_PROVIDER).toBe('saspay');
  });

  it('retombe sur le défaut plutôt que de tomber', () => {
    // Une faute de frappe dans une variable ne doit pas empêcher un client de
    // payer.
    process.env.PAYMENT_PROVIDER = 'saspai';
    expect(paymentProviderFor()).toBe(DEFAULT_PAYMENT_PROVIDER);
  });
});

describe('la construction d une passerelle', () => {
  it('dit ce qui manque plutôt que d encaisser à moitié', () => {
    expect(() => createPaymentGateway()).toThrow(PaymentNotConfiguredError);
    expect(isBillingConfigured()).toBe(false);
  });

  it('déclare ce qu un rappel permet de retrouver', () => {
    /*
     * La seule différence entre deux prestataires qui casse en silence : un
     * rappel qui ne porte aucune de nos clés traité comme s'il en portait une
     * laisse le client payer sans jamais être crédité.
     */
    process.env.SASPAY_SANDBOX_API_KEY = 'sk_test_abc';
    process.env.SASPAY_SANDBOX_WEBHOOK_SECRET = 'whsec';

    const passerelle = createGatewayFor('saspay');
    expect(passerelle.callbackIdentifies).toBe('nothing');
    expect(passerelle.provider).toBe('saspay');
    // Chacun signe sa charge à sa façon : une route ne lit que le sien.
    expect(passerelle.callbackPath).toBe('/api/webhooks/saspay');
  });

  it('passe par la variable depuis l entrée unique', () => {
    process.env.SASPAY_SANDBOX_API_KEY = 'sk_test_abc';
    process.env.SASPAY_SANDBOX_WEBHOOK_SECRET = 'whsec';
    process.env.PAYMENT_PROVIDER = 'saspay';

    expect(createPaymentGateway().provider).toBe('saspay');
    expect(isBillingConfigured()).toBe(true);
  });
});

describe('la liste des prestataires', () => {
  it('contient le défaut, et chacun sait se construire', () => {
    // Un nom dans la liste sans fabrique derrière serait une promesse vide :
    // la faute ne se verrait qu'au premier client qui veut payer.
    expect(PAYMENT_PROVIDERS).toContain(DEFAULT_PAYMENT_PROVIDER);

    for (const provider of PAYMENT_PROVIDERS) {
      expect(() => createGatewayFor(provider)).toThrow(PaymentNotConfiguredError);
    }
  });
});
