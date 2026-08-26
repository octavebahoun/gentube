# Prince — notifications et reprise après échec

Du Next.js pur. Aucune infrastructure nouvelle à apprendre, et c'est délibéré :
ton chantier est celui où la logique compte plus que les outils.

## La règle qui gouverne tout ton chantier

**Un échec ne ferme jamais la porte à une reprise.**

L'exemple à copier est le montage. Quand un rendu échoue, la vidéo reste
`rendering` — pas `failed`. Les crédits sont déjà débités, les visuels existent,
et une relance ne repaie rien. La marquer `failed` obligerait à tout refaire.

Le même principe est déjà appliqué partout où ça coûte de l'argent :

- `generateVoiceover` saute les scènes déjà mesurées.
- `finalizeVoiceover` saute les scènes déjà livrées par le bon fournisseur.
- `startRender` renvoie le job existant au lieu d'en démarrer un second.
- Le débit porte la clé d'idempotence `video:<id>:debit`.

Quand tu ajoutes une relance, demande-toi ce qu'elle repaie. Si la réponse n'est
pas « rien », elle est fausse.

## La table `jobs`

C'est ta matière première : `step`, `external_id` (**unique**, pour qu'un webhook
rejoué résolve exactement un job), `status`, `payload`, `error`, `attempts`.

`refundVideo` existe déjà dans `lib/credits/ledger.ts` : il rembourse au plus ce
qui a été réellement facturé et marque la vidéo `failed`. C'est le dernier
recours, pas le premier réflexe — rembourser une vidéo dont les visuels sont
faits, c'est jeter ce qui a été payé.

## Les notifications : rien n'existe

Et le canal n'est **pas** une décision technique. Ici, WhatsApp est plus lu
qu'un email, et un SMS coûte. Pose la question avant de coder : c'est un choix
produit, pas un choix de bibliothèque.

Ce qui est sûr, c'est le déclencheur : une vidéo qui passe `rendered`, un rendu
qui échoue, un solde de crédits qui tombe sous le prix de la prochaine vidéo.

## La convention de l'app

Presque tout passe par des **server actions**, pas par des API routes — il y en
a cinq en tout dans le projet, et ce sont des webhooks ou des lectures. Le motif
est `validatedActionWithUser` avec `useActionState` côté écran.

Une action qui n'est pas dans ce motif est probablement une route qui n'aurait
pas dû exister.

## Ce que tu ne touches pas

Les migrations (`lib/db/migrations/`) : le `_journal.json` casse dès que deux
personnes en génèrent. Si tu as besoin d'une colonne, demande.

À lire d'abord : `docs/passation.md`, et `lib/render/service.ts` en entier —
c'est le modèle de reprise le plus abouti du dépôt.
