import { createPaymentGateway } from '@/lib/payments';
import { reveiller, reveillerUn } from './reveil';

/**
 * Le réveil à la main.
 *
 * `lib/billing/webhook.ts` est aujourd'hui le seul déclencheur du réveil. Tant
 * qu'aucun rappel n'aboutit — webhook pas encore déclaré, secret qui ne
 * correspond pas, déploiement au mauvais moment — un client peut être débité
 * sans jamais être crédité, et rien ne le rattrape.
 *
 * Ce point d'entrée est ce rattrapage. Il ne contient aucune logique : il
 * appelle exactement ce que le rappel appellerait, donc un paiement rattrapé
 * ici passe par les mêmes garde-fous — la passerelle fait autorité, le montant
 * et la devise sont revérifiés, et la clé d'idempotence empêche le double
 * crédit si le rappel finit par arriver.
 *
 *   pnpm billing:reveil              relit la file d'attente (25 max)
 *   pnpm billing:reveil <reference>  relit un seul encaissement
 *
 * ⚠️ Il écrit dans la base que DATABASE_URL désigne. Elle est affichée avant
 * toute écriture — c'est du crédit client, pas un essai.
 */
async function main(): Promise<void> {
  const reference = process.argv[2];
  const gateway = createPaymentGateway();

  const cible = new URL(process.env.DATABASE_URL ?? 'postgres://inconnu');
  console.log(`Base       : ${cible.host}${cible.pathname}`);
  console.log(`Passerelle : ${gateway.provider} (${process.env.SASPAY_ENV ?? 'sandbox'})`);
  console.log(reference ? `Référence  : ${reference}` : 'Portée     : toute la file en attente');
  console.log('');

  const resultat = reference
    ? await reveillerUn(gateway, reference)
    : await reveiller(gateway);

  console.log(`Relus      : ${resultat.relus}`);
  console.log(`Crédités   : ${resultat.credites}`);
  console.log(`Échoués    : ${resultat.echoues}`);
  console.log(`En attente : ${resultat.enAttente}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
