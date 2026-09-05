import { PaymentNotConfiguredError } from '@/lib/payments';

/**
 * Ce que la facturation lit dans l'environnement — et qui ne dépend d'aucun
 * prestataire.
 *
 * Les clés du prestataire vivaient ici tant qu'il n'y en avait qu'un : elles
 * sont désormais chez lui (`lib/payments/saspay.ts`), avec le reste de son
 * contrat. Ce fichier ne garde que ce qui est vrai quel que soit l'encaisseur.
 */

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Origine publique utilisée pour construire l'URL par laquelle la passerelle
 * renvoie le payeur. Une mauvaise valeur ici laisse l'utilisateur sur une page
 * morte après avoir payé, donc c'est requis plutôt que deviné depuis la
 * requête — une requête est fournie par le navigateur.
 */
export function appBaseUrl(): string {
  const base = read('BASE_URL');
  if (!base) throw new PaymentNotConfiguredError('BASE_URL');
  return base.replace(/\/+$/, '');
}
