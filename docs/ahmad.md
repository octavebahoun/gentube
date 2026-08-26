# Ahmad — l'entonnoir client

Cinq zones : **création, storyboard, fabrication, bibliothèque, lecteur**. C'est
le chemin que parcourt un client du prompt à la vidéo publiée.

Le découpage avec Rosaire est par **zone**, pas par écran : sinon vous éditez le
même composant tous les deux.

## La palette n'est pas négociable

Échantillonnée sur la maquette `docs/fr1.png` :

| Rôle | Valeur |
|---|---|
| Rouge principal | `#CE1F20` |
| Accent | `#E52627` |
| Fond | `#111111` |
| Surface | `#1B1B1B` |

Sombre par défaut. Les tokens sont déjà dans `app/globals.css` — utilise-les, ne
recode pas une couleur en dur. Il y avait 31 `orange-*` codés en dur dans le
dépôt, ils ont tous été remplacés ; n'en réintroduis pas.

## Ce qui existe déjà

L'éditeur de storyboard est fait : glisser-déposer avec `@dnd-kit`, prix par
scène, bascule estimé → mesuré. Lis-le avant d'écrire quoi que ce soit, il porte
les conventions.

## Le piège des écrans repris

Une partie des écrans vient d'un autre projet et **lit Supabase directement**.
Rebrancher les données sur nos server actions est la moitié du travail — pas un
détail de fin. Ne recopie pas un écran sans regarder d'où il tire ses données.

Second écart : le dépôt utilise `@base-ui/react`, les écrans repris attendent
parfois `radix-ui`. Les composants ne se substituent pas un pour un.

## Deux choses que les écrans doivent dire juste

**Le prix.** Il est affiché avant validation et c'est la promesse du produit :
le montant sur le bouton est le montant débité, exactement. Si un écran affiche
une estimation là où le chiffre est ferme, ou l'inverse, c'est un bug — pas un
détail de libellé.

**Le filigrane.** Une vidéo garde la marque avec laquelle elle a été payée. Un
client qui s'abonne après coup ne récupère pas le rendu propre de sa vidéo
d'essai. L'écran doit le dire avant le paiement, pas après.

## Ce que tu ne touches pas

`lib/` — ni la base, ni les migrations, ni les fournisseurs. Il te manque une
server action ? Demande à Prince ou à moi ; ça se rajoute en dix minutes et ça
évite deux implémentations du même appel.

À lire d'abord : `docs/brief-ui.md`, puis `docs/produit-et-wireframes.md`.
