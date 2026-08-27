# Plans animés — Replicate

**Pour Cosme**, en plus de sa voie sécurité, voir `docs/cosme.md`.

Deux raisons de le mettre là. C'est l'étape la plus isolée du pipeline : un
appel fournisseur, un webhook, une boucle reprenable, sans toucher ni à l'ordre
des étapes ni au chemin de l'argent. Et son point délicat est ta compétence,
**un webhook dont la signature ne vérifie pas doit être rejeté**, sans quoi
n'importe qui peut déclarer qu'un clip est prêt.

Les décisions de fournisseur sont arrêtées dans `docs/providers.md`. Ce qui suit
est ce qu'elles impliquent pour le code.

## Trois modèles, une couche d'abstraction

| Résolution ou usage | Modèle | Prix |
|---|---|---|
| 480p | `wan-video/wan-2.2-i2v-fast` | 0,05 $ le clip de 5 s |
| 720p | `prunaai/p-video` | 0,02 $ la seconde |
| Avatar conteur, lip-sync | `prunaai/p-video-avatar` | 0,025 $ la seconde en 720p |

Écris `lib/video/provider.ts` avant d'écrire l'étape, sur le modèle de
`lib/voice/index.ts` qui fait déjà ce travail pour la voix. Elle reçoit la
résolution et le type de plan, elle renvoie le modèle. Sans cette couche, le
choix du modèle se retrouve dispersé dans l'étape et changer de fournisseur
devient un chantier.

## Les deux bornes d'une scène animée

Une scène animée dure **entre 5 et 10 secondes**, et les deux bornes ne viennent
pas du même endroit.

**Le plancher protège la marge.** Wan facture au clip, pas à la seconde : une
scène de 3 secondes coûte exactement le prix d'une scène de 5. La règle se pose
dans le prompt du LLM et se fait respecter côté serveur, comme le type de scène.
Cette partie-là est chez Prince, qui tient `lib/storyboard/`. Coordonne-toi avec
lui plutôt que de la poser deux fois.

**Le plafond est une limite du modèle.** p-video ne dépasse pas dix secondes par
clip, soit environ 140 caractères de narration.

## Ce qui est déjà prêt à recevoir

- `lib/storyboard/images.ts`, le modèle d'étape reprenable à imiter :
  séquentielle, chaque scène écrite dès qu'elle réussit.
- La table `jobs` avec `external_id` **unique**, pour qu'un webhook rejoué
  résolve exactement un job.
- Deux colonnes distinctes sur `shots`. `source_image_url` porte l'image fixe,
  générée pour **toutes** les scènes puisque ces modèles font de
  l'image-to-video ; `asset_url` porte ce que le rendu consomme. Les confondre
  ferait qu'une reprise du clip repaie l'image, et l'image d'un plan animé
  décide de son cadrage.
- `REPLICATE_API_TOKEN` et `REPLICATE_WEBHOOK_SECRET` documentés dans
  `.env.example`. Le secret se récupère une fois sur
  `https://api.replicate.com/v1/webhooks/default/secret`.

## Les règles d'intégration, toutes vérifiables

- Modèles officiels uniquement, jamais un modèle communautaire dans le chemin
  critique.
- Webhooks systématiques, jamais d'attente bloquante. Une requête HTTP ne doit
  pas attendre une génération.
- Signature vérifiée **avant** toute écriture.
- Images d'entrée servies depuis R2 par URL signée, jamais par un bucket ouvert.
- Les clips d'une même vidéo partent **en parallèle**. C'est la raison d'être du
  choix de Replicate : quinze clips en séquentiel prennent dix minutes, et le
  client suivant attend.

## Ce que la composition ne sait pas encore faire

`lib/render/composition.ts` pose le média en `background-image`, ce qui n'affiche
qu'une image fixe. **Un clip mp4 y rendrait du vide, sans lever d'erreur.**

Le moteur HyperFrames gère pourtant la vidéo : il pré-extrait les images d'une
balise `<video>` déclarée comme élément de timeline, donc portant son propre
`data-start`. Vérifié dans le code du moteur le 27 août 2026.

Deux choses à décider en l'écrivant. Un clip plus court que sa narration, et
c'est le cas courant puisque Wan rend 5,06 s : le pipeline précédent ralentissait
la lecture (`playbackRate` de 0,703 pour étirer 5,06 s sur 7,2 s). Et le fait que
nos clips ne portent pas de piste audio, donc rien à mélanger avec la voix.

## Le piège du solde Replicate

Replicate réduit progressivement le débit à mesure que le crédit s'épuise. Sans
moyen de paiement enregistré, la limite tombe à une requête par seconde, et
**aucune erreur claire n'est renvoyée** : les générations ralentissent, les
clients attendent, et les journaux n'expliquent rien.

Le compte est tenu par Merveille (rechargement automatique, solde au-dessus de
20 $). Si tes générations ralentissent sans raison, c'est la première chose à
regarder, avant de soupçonner le code.

## Ce qui reste à décider

Le mode de repli quand un clip échoue. Mon avis, à prendre ou à laisser : il
retombe sur son image fixe, parce qu'une scène fixe dans une vidéo livrée vaut
mieux qu'une vidéo non livrée qui a été payée. Mais il faut alors le dire au
client et ne pas lui facturer le tarif animé pour une scène fixe, deux crédits
la seconde contre un.

Et trois vérifications à faire sur le compte avant d'ouvrir les inscriptions,
listées en fin de `docs/providers.md`. La deuxième décide du plancher : si un
clip de 8 s coûte autant qu'un de 5 s, il monte à 8 secondes.

## Ce que ça n'est pas

Ce n'est pas une étape à brancher dans n8n : ça, c'est chez Ezechiel. Tu écris
l'étape et ses reprises, il décide quand elle tourne.
