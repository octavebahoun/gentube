# Rosaire — compte et administration

Quatre zones : **facturation, équipe, projets**, et les **15 écrans d'admin**.

Le découpage avec Ahmad est par **zone**, pas par écran : sinon vous éditez le
même composant tous les deux.

## La palette n'est pas négociable

Échantillonnée sur la maquette `docs/fr1.png` :

| Rôle | Valeur |
|---|---|
| Rouge principal | `#CE1F20` |
| Accent | `#E52627` |
| Fond | `#111111` |
| Surface | `#1B1B1B` |

Sombre par défaut. Les tokens sont dans `app/globals.css` — pas de couleur en
dur. Il y en avait 31, elles ont toutes été remplacées.

## La facturation : ce qu'il faut comprendre avant de dessiner

**Deux poches, pas un solde.** Les crédits du plan expirent à la fin du cycle ;
les crédits achetés n'expirent jamais. Un écran qui affiche un seul nombre cache
la seule information qui compte : ce qui va disparaître à la fin du mois.
`tenants.credits_balance` est la somme des deux, dénormalisée — les deux poches
sont `credits_plan` et `credits_topup`.

**En FCFA (XOF), payé en mobile money** via GeniusPay. Pas de centimes, pas de
carte bancaire par défaut.

**Le catalogue est du code**, dans `lib/billing/plans.ts`. Il n'y a pas d'écran
d'admin pour changer les prix, et il n'en faut pas : un prix qui se modifie en
production sans revue est un incident qui attend.

## Les écrans d'admin

Quinze écrans, et ce sont des bonus : rien n'en dépend pour qu'un client
produise une vidéo. Traite-les après facturation, équipe et projets.

Le piège : une partie vient d'un autre projet et **lit Supabase directement**.
Rebrancher les données sur nos server actions est la moitié du travail.

## Ce que tu ne touches pas

`lib/` — ni la base, ni les migrations, ni les fournisseurs. Il te manque une
server action ? Demande à Prince ou à moi.

À lire d'abord : `docs/tarifs.md` (les deux poches et les marges par plan), puis
`docs/brief-ui.md`.
