import { BillingNotConfiguredError } from './config';
import { InvalidAmountError, UnknownOfferError } from './plans';
import { BillingError } from './checkout';

/**
 * Maps a billing failure onto an HTTP answer.
 *
 * Everything unrecognised becomes a flat 500 with no detail: an unexpected
 * error message can carry a gateway response or a query fragment, and this text
 * is returned to the browser.
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
