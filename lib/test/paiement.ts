import { createHmac } from 'node:crypto';
import type {
  CallbackEvent,
  CheckoutRequest,
  OpenedCheckout,
  PaymentGateway,
  Settlement,
  SettlementStatus,
} from '@/lib/payments';

/**
 * Doublure de passerelle de paiement.
 *
 * Le checkout comme le pipeline de rappel acceptent une passerelle injectable,
 * donc aucun test ne touche le réseau — et aucun test n'a besoin des vraies
 * clés dans l'environnement.
 *
 * Elle imite SasPay là où c'est structurant : `callbackIdentifies` vaut
 * `nothing` par défaut, parce que c'est ce cas-là qui oblige au réveil et donc
 * celui que les tests doivent couvrir. Un test qui veut l'autre chemin le
 * demande explicitement.
 */

export const SECRET_DE_TEST = 'whsec_test_0123456789';

/** Un règlement tel que la passerelle le rapporterait sur `settle()`. */
export function reglement(patch: Partial<Settlement> = {}): Settlement {
  return {
    status: 'paid',
    amountXof: 15_000,
    currency: 'XOF',
    feeXof: 488,
    chargedXof: 15_488,
    netXof: 15_000,
    transactionId: 'txn-test-1',
    ...patch,
  };
}

export type PasserelleFactice = {
  gateway: PaymentGateway;
  /** Ce qu'on lui a demandé d'ouvrir. */
  ouverts: CheckoutRequest[];
  /** Les références qu'on lui a demandé de relire. */
  relus: string[];
};

/**
 * Signe un corps comme le ferait le prestataire, pour que les tests du
 * pipeline passent la vérification sans la contourner.
 */
export function entetesSignees(
  rawBody: string,
  {
    secret = SECRET_DE_TEST,
    now = Date.now(),
    event = 'transaction.success',
  }: { secret?: string; now?: number; event?: string } = {}
): Record<string, string> {
  const timestamp = String(Math.floor(now / 1000));
  return {
    'x-webhook-timestamp': timestamp,
    'x-webhook-event': event,
    'x-webhook-signature': createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex'),
  };
}

export function corpsDeRappel(
  status: SettlementStatus = 'paid',
  patch: Record<string, unknown> = {}
): string {
  const evenement =
    status === 'paid'
      ? 'transaction.success'
      : status === 'cancelled'
        ? 'transaction.cancelled'
        : status === 'failed'
          ? 'transaction.failed'
          : 'transaction.created';

  return JSON.stringify({
    event: evenement,
    data: {
      id: 'txn-test-1',
      reference: 'TXN-2026-000456',
      status: status === 'paid' ? 'SUCCESS' : status.toUpperCase(),
      ...patch,
    },
  });
}

/**
 * Une passerelle factice.
 *
 * `onOpen` et `onSettle` permettent à un test de faire échouer l'un ou l'autre
 * appel, ou de répondre quelque chose en désaccord avec le corps du rappel —
 * c'est exactement le cas que le pipeline doit trancher en faveur de la
 * passerelle.
 */
export function passerelleFactice({
  reference = 'CS-REF-1',
  checkoutUrl,
  callbackIdentifies = 'nothing',
  onOpen,
  onSettle,
}: {
  reference?: string;
  checkoutUrl?: string;
  callbackIdentifies?: 'reference' | 'nothing';
  onOpen?: (request: CheckoutRequest) => Promise<OpenedCheckout>;
  onSettle?: (reference: string) => Promise<Settlement>;
} = {}): PasserelleFactice {
  const ouverts: CheckoutRequest[] = [];
  const relus: string[] = [];

  const gateway: PaymentGateway = {
    provider: 'test',
    callbackIdentifies,
    callbackPath: '/api/webhooks/test',

    async openCheckout(request) {
      ouverts.push(request);
      if (onOpen) return await onOpen(request);
      return {
        reference,
        checkoutUrl: checkoutUrl ?? `https://pay.test/checkout/${reference}`,
      };
    },

    async settle(ref) {
      relus.push(ref);
      if (onSettle) return await onSettle(ref);
      return reglement();
    },

    verifyCallback({ headers, rawBody, now = Date.now() }) {
      const timestamp = headers['x-webhook-timestamp'];
      const fournie = headers['x-webhook-signature'];
      if (!timestamp || !fournie) return false;
      if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
      return (
        fournie ===
        createHmac('sha256', SECRET_DE_TEST)
          .update(`${timestamp}.${rawBody}`)
          .digest('hex')
      );
    },

    readCallback(rawBody, headers): CallbackEvent {
      const charge = JSON.parse(rawBody);
      const brut = String(charge?.data?.status ?? '').toUpperCase();
      const status: SettlementStatus =
        brut === 'SUCCESS'
          ? 'paid'
          : brut === 'FAILED'
            ? 'failed'
            : brut === 'CANCELLED'
              ? 'cancelled'
              : 'pending';

      return {
        name: charge.event ?? 'transaction.created',
        status,
        // Le cas SasPay : la charge ne porte rien qui vienne de nous.
        reference: callbackIdentifies === 'reference' ? reference : null,
        eventId: `sig:${headers['x-webhook-signature'] ?? 'none'}`,
      };
    },

    async ping() {
      return { balance: '0.00' };
    },
  };

  return { gateway, ouverts, relus };
}
