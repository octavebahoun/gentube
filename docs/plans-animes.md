# Plans animés — Wan sur Replicate

**Pour Cosme**, en plus de sa voie sécurité — voir `docs/cosme.md`.

Deux raisons de le mettre là plutôt qu'ailleurs. C'est l'étape la plus isolée du
pipeline : un appel fournisseur, un webhook, une boucle reprenable. Elle ne
touche ni l'ordre des étapes, ni le chemin de l'argent. Et son point délicat est
précisément ta compétence : **un webhook dont la signature ne vérifie pas doit
être rejeté**, sans quoi n'importe qui peut déclarer qu'un clip est prêt.

## Où ça se branche

Entre les images et le montage. Ce n'est pas une étape parallèle : Wan fait de
l'**image-to-video**, donc la fixe est la matière première du clip.

C'est pour ça que `shots` porte deux colonnes et non une :

- `source_image_url` — l'image fixe, générée pour **toutes** les scènes, y
  compris animées.
- `asset_url` — ce que le rendu consomme : la fixe, ou le clip.

Les confondre ferait qu'une reprise du clip repaierait l'image. Et l'image d'un
plan animé décide de son cadrage : on veut pouvoir régénérer le clip sans
rejouer le dé.

## Ce qui est déjà prêt à recevoir

- `lib/storyboard/images.ts` — le modèle d'étape reprenable à imiter :
  séquentielle, chaque scène écrite dès qu'elle réussit.
- La table `jobs` avec `external_id` **unique**, pour qu'un webhook Replicate
  rejoué résolve exactement un job.
- `REPLICATE_API_TOKEN` et `REPLICATE_WEBHOOK_SECRET` déjà documentés dans
  `.env.example`. Le secret se récupère une fois sur
  `https://api.replicate.com/v1/webhooks/default/secret` ; un webhook dont la
  signature ne vérifie pas est rejeté.

## Ce qui reste à décider

Le modèle exact (`wan-video/wan-2.2-*`), la durée de clip, et si un plan animé
qui échoue retombe sur son image fixe au lieu de faire échouer la vidéo entière.

L'avis de celui qui a écrit l'étape des images, à prendre ou à laisser : **oui,
il retombe.** Une scène fixe dans une
vidéo livrée vaut mieux qu'une vidéo non livrée qui a été payée. Mais alors il
faut le dire au client, et ne pas lui facturer le tarif animé pour une scène
fixe — deux crédits la seconde contre un.

La demande de dépense est envoyée, donc ce chantier n'est plus bloqué.

## Ce que ça n'est pas

Ce n'est pas une étape à brancher dans n8n : ça, c'est chez Ezechiel. Tu écris
l'étape et ses reprises ; il décide quand elle tourne.
