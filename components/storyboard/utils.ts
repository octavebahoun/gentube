export type ActionState = { error?: string; success?: string };

export function seconds(value: number) {
  // Une durée mesurée est fractionnaire (5,28 s) ; une estimation rarement.
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} s`;
}

export function frenchCredits(value: number) {
  return value.toLocaleString('fr-FR');
}
