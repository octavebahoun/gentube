# Plans animés — Wan sur Replicate

Ma part. Le fichier porte le nom du chantier et pas le mien : renomme-le si tu
préfères.

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
qui échoue retombe sur sa fixe au lieu de faire échouer la vidéo entière. Mon
avis : oui, il retombe — une scène fixe dans une vidéo livrée vaut mieux qu'une
vidéo non livrée qui a été payée.

La demande de dépense est envoyée, donc ce chantier n'est plus bloqué.
