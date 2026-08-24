# GenTube — tarifs et coûts

Chiffré le 25 août 2026. Base : 1 $ = 625 FCFA.

---

## L'unité

**1 crédit = 1 seconde de vidéo en 480p.**
Le 720p coûte **3 crédits/seconde** (il coûte réellement 2,1× le 480p).

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
| Starter | 15 000 FCFA | 1 320 | 22 min | Amazon Polly Neural | 41 % |
| Pro | 30 000 FCFA | 2 700 | 45 min | ElevenLabs | 40 % |
| Business | sur devis | négocié | négocié | ElevenLabs | négocié |

**Recharge : 5 000 FCFA = 360 crédits = 6 minutes.**

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

- [ ] `CREDITS_PER_SECOND['720p']` : 4 → **3**
- [ ] `PLAN_MONTHLY_CREDITS` : starter 1 333 → **1 320**, pro 3 000 → **2 700**
- [ ] Pack de recharge : 3 000 → **360 crédits**
- [ ] Mettre à jour les assertions de `lib/credits/pricing.test.ts`
- [ ] Deux poches de crédits : plan (expire) et recharge (n'expire jamais)
