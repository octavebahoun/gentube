import { PaymentNotConfiguredError, read, type PaymentGateway } from './contract';
import { createSasPayGateway, isSasPayConfigured } from './saspay';

/**
 * La passerelle des encaissements.
 *
 * Le troisième domaine à en recevoir une, après la voix et la vidéo, et pour
 * la même raison : un prestataire écrit en dur dans le métier est un
 * prestataire qu'on ne remplace pas sans rouvrir le métier. GeniusPay l'avait
 * appris à ses dépens — son remplacement a touché huit fichiers.
 *
 * Le métier n'appelle que `createPaymentGateway()`. Ajouter un prestataire est
 * un fichier, un nom dans `PAYMENT_PROVIDERS`, une branche ici, et une route de
 * rappel.
 *
 * **Ce que la passerelle ne cache pas.** Deux prestataires ne se ressemblent
 * pas sur le point qui compte : ce que leur rappel permet de retrouver. Cette
 * différence est **déclarée** sur le contrat (`callbackIdentifies`) parce
 * qu'elle ne lève aucune erreur quand on se trompe — elle laisse simplement des
 * clients payer sans être crédités.
 */

export {
  CURRENCY,
  PaymentError,
  PaymentNotConfiguredError,
  SIGNATURE_TOLERANCE_S,
  assertXofAmount,
  parseXof,
  type CallbackEvent,
  type CallbackIdentification,
  type CheckoutRequest,
  type OpenedCheckout,
  type PaymentGateway,
  type Settlement,
  type SettlementStatus,
} from './contract';

export {
  SasPayGateway,
  createSasPayGateway,
  isFreshTimestamp,
  isSasPayConfigured,
  sasPayConfig,
  sasPayEnvironment,
  type SasPayConfig,
  type SasPayEnvironment,
} from './saspay';

export type PaymentProvider = 'saspay';

export const PAYMENT_PROVIDERS: readonly PaymentProvider[] = ['saspay'];

/** Le prestataire du produit, tant que rien ne dit le contraire. */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = 'saspay';

/**
 * Qui encaisse, lu dans l'environnement.
 *
 * Un nom inconnu retombe sur le défaut plutôt que de faire tomber la
 * facturation : une faute de frappe dans une variable ne doit pas empêcher un
 * client de payer.
 */
export function paymentProviderFor(): PaymentProvider {
  const nomme = read('PAYMENT_PROVIDER');
  return PAYMENT_PROVIDERS.includes(nomme as PaymentProvider)
    ? (nomme as PaymentProvider)
    : DEFAULT_PAYMENT_PROVIDER;
}

/** Construit le client d'un prestataire nommé, ou dit ce qui lui manque. */
export function createGatewayFor(provider: PaymentProvider): PaymentGateway {
  if (provider === 'saspay') {
    if (!isSasPayConfigured()) {
      throw new PaymentNotConfiguredError('SASPAY_* keys');
    }
    return createSasPayGateway();
  }

  throw new PaymentNotConfiguredError(`unknown payment provider "${provider}"`);
}

/** L'entrée unique des encaissements. Le métier ne connaît que celle-ci. */
export function createPaymentGateway(): PaymentGateway {
  return createGatewayFor(paymentProviderFor());
}

/** Vrai si le prestataire retenu a tout ce qu'il lui faut pour encaisser. */
export function isBillingConfigured(): boolean {
  try {
    createPaymentGateway();
    return true;
  } catch {
    return false;
  }
}
