import { BillingNotConfiguredError } from './config';
import { InvalidAmountError, UnknownOfferError } from './plans';
import { BillingError } from './checkout';

/**
 * Traduit un échec de facturation en réponse HTTP.
 *
 * Tout ce qui n'est pas reconnu devient un 500 plat sans détail : un message
 * d'erreur inattendu peut porter une réponse de la passerelle ou un fragment
 * de requête, et ce texte est renvoyé au navigateur.
 */
export function billingErrorResponse(error: unknown): {
  status: number;
  message: string;
} {
  if (
    error instanceof BillingError ||
    error instanceof UnknownOfferError ||
    error instanceof BillingNotConfiguredError
  ) {
    return { status: error.statusCode, message: error.message };
  }

  if (error instanceof InvalidAmountError) {
    return { status: 400, message: error.message };
  }

  console.error('Unexpected billing error:', error);
  return { status: 500, message: 'Billing is temporarily unavailable.' };
}
