# GenTube — tarifs et coûts

Chiffré le 25 août 2026. Base : 1 $ = 625 FCFA.

---

## L'unité

**1 crédit = 1 seconde d'image fixe en 480p.**

| | 480p | 720p |
|---|---|---|
| Plan en image fixe | 1 crédit/s | 3 crédits/s |
| Plan animé | 2 crédits/s | 6 crédits/s |

Un plan animé coûte le double parce qu'il nous coûte réellement bien plus :
~400 FCFA la minute contre ~30 pour des images fixes. Facturer les deux au
même prix faisait payer aux clients « diaporama » — l'usage d'entrée de gamme,
le plus sensible au prix — le tarif de la vidéo générée.

Le 720p reste à 3× le 480p : il coûte réellement 2,1× plus cher.

---

## Ce qu'une minute nous coûte

| Poste | 480p | 720p |
|---|---|---|
| Clips Replicate — 12 × 5 s | 375 FCFA | 825 FCFA |
| Voix Amazon Polly Neural | 10 FCFA | 10 FCFA |
| Rendu Lambda | ~12 FCFA | ~12 FCFA |
| Script DeepSeek, stockage R2 | négligeable | négligeable |
| **Total** | **~400 FCFA** | **~850 FCFA** |

Replicate facture **par vidéo générée**, pas par seconde : 81 images à 16 fps
font 5,06 s de clip, à 0,05 $ en 480p et 0,11 $ en 720p.

Attention : l'option `interpolate_output` (30 fps) fait monter à 0,065 $ et
0,145 $. À n'activer que si le rendu final le justifie.

---

## Les plans

| Plan | Prix/mois | Crédits | Minutes 480p | Voix | Marge |
|---|---|---|---|---|---|
| Starter | 15 000 FCFA | 2 640 | 22 min animées, ou 44 min d'images | Amazon Polly Neural | 41 % |
| Pro | 30 000 FCFA | 5 400 | 45 min animées, ou 90 min d'images | ElevenLabs | 40 % |
| Business | sur devis | négocié | négocié | ElevenLabs | négocié |

**Essai gratuit : 120 crédits à l'inscription**, soit une minute animée ou
deux minutes d'images fixes. **480p uniquement, avec filigrane.**

Coût réel : 400 FCFA au pire par inscription, 60 FCFA si l'essai part en
images fixes. C'est un budget publicitaire.

Le filigrane est posé **au débit**, pas au rendu : une vidéo garde la marque
avec laquelle elle a été payée. Les deux concurrents directs vendent « sans
filigrane » comme fonctionnalité payante, donc c'est attendu sur ce marché.

**Recharge : 5 000 FCFA = 720 crédits**, soit 6 minutes animées ou 12 minutes
d'images fixes.

Volontairement un peu plus chère que l'abonnement — 833 FCFA/min contre 682 —
sinon personne ne s'abonne. Marge 52 %.

Le 720p est disponible **sur tous les plans**. C'est l'argent du client, il
choisit sa qualité.

---

## Marge cible : 40 %

Ce n'est pas du bénéfice. Ces 40 % doivent encore payer la commission
GeniusPay (1,5 %), les serveurs, et l'équipe.

**Cinq mois d'investissement à perte sont assumés** — c'est la période de
lancement.

**Les 15 premiers clients gardent leur tarif pendant 1 an**, même après la
hausse. C'est aussi l'argument de lancement : rejoindre tôt a une valeur.

---

## Les modèles

| Usage | Modèle | Pourquoi |
|---|---|---|
| Script et storyboard | DeepSeek `deepseek-v4-flash` | P1. Anthropic reporté en P2. |
| Images | Flux sur Cloudflare Workers AI | Sans commune mesure avec Replicate. |
| Clips vidéo | `wan-video/wan-2.2-i2v-fast` | Image-to-video : on anime l'image déjà générée au lieu de repartir de zéro. Moins cher et cohérent avec le storyboard. |
| Voix par défaut | Amazon Polly Neural | 5× moins cher qu'ElevenLabs. **Speech marks obligatoires** — ce sont eux qui donnent les timings mot à mot. |
| Voix premium | ElevenLabs | Réservée à Pro et Business. Le français de Polly est plus robotique : la qualité de voix devient une raison d'acheter le plan supérieur. |

Polly offre **1 M de caractères neural gratuits par mois pendant 12 mois** —
soit environ 1 190 minutes de narration. La voix est donc quasi gratuite sur
toute la période d'investissement.

---

## Plafonds externes

- **GeniusPay : 500 000 FCFA/mois** pour toute la plateforme, commission 1,5 %.
- **YouTube : 10 000 unités/jour**, soit ~6 publications par jour, tous
  clients confondus.

---

## Reste à faire dans le code

Les constantes vivent dans `lib/credits/pricing.ts`.

- [x] `CREDITS_PER_SECOND['720p']` : 4 → **3**
- [x] `PLAN_MONTHLY_CREDITS` : starter → **2 640**, pro → **5 400**
- [x] Pack de recharge : → **720 crédits**
- [x] `CREDITS_PER_SECOND` est indexé par type de plan **et** par résolution
- [x] Mettre à jour les assertions de `lib/credits/pricing.test.ts`
- [ ] Deux poches de crédits : plan (expire) et recharge (n'expire jamais)
