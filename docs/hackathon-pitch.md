# GenTube — Pitch hackathon

> **Un thème entre, une vidéo prête pour YouTube sort.**
> La plateforme qui donne une voix off, des images IA et un montage aux
> créateurs d'Afrique francophone — payables en mobile money.

---

## Le problème

Produire une vidéo régulière demande du matériel, des logiciels, des heures de
montage et des sous-titres faits main. Sur le marché ouest-africain, les
créateurs et petites entreprises ont le sujet et l'audience — pas les moyens
d'une chaîne de production. Et quand l'outil existe, il se paie en dollars
avec une carte bancaire.

## La solution

GenTube est un SaaS multi-tenant où l'utilisateur écrit un thème :

1. **Storyboard** — un LLM découpe le thème en scènes (narration + prompt visuel)
2. **Voix off** — synthèse vocale réaliste ; sa durée *mesurée* devient la durée de chaque scène
3. **Visuels** — images générées par IA, clips animés image-à-vidéo
4. **Montage** — rendu automatique : sous-titres karaoké mot à mot, transitions, sound design
5. **Publication** — la vidéo part directement sur la chaîne YouTube du client

**Le différenciateur : le prix exact avant de générer.** Le client voit ce que
la vidéo va lui coûter en crédits *avant* validation — facturée à la seconde
d'audio réellement mesurée, jamais à une estimation.

## Le marché

- Créateurs de contenu, agences, commerces qui veulent publier souvent
- Paiement local : **mobile money via GeniusPay** (XOF), abonnements + packs
- Économie maîtrisée : 1 crédit = 1 s de 480p · Starter 15 000 F/mois ·
  Pro 30 000 F/mois · coût réel ≈ 400 FCFA la minute → marge visée 40 %

## La stack

| Couche | Techno |
|---|---|
| App | Next.js 15 · React 19 · Tailwind |
| Données | PostgreSQL · Drizzle ORM · isolation par tenant imposée dans le code |
| Stockage | Cloudflare R2 — privé, URLs signées courte durée |
| IA | DeepSeek (storyboard) · ElevenLabs (voix) · Flux (images) · wan-2.2 (clips) |
| Rendu | Hyperframes HTML→MP4 sur AWS Lambda |
| Orchestration | n8n · paiements GeniusPay · API YouTube |

**Qualité : 252 tests verts**, chemins monétaires transactionnels avec
idempotence, secrets chiffrés au repos.

## Ce qui tourne déjà (démo)

Comptes & équipes → projets → storyboard éditable → voix off mesurée →
crédits facturés au juste prix → paiement sandbox GeniusPay.
Quatre états de vidéo outillés : brouillon, en production, échec remboursé,
publiée.

## L'équipe — 4 devs, 1 règle

*Le lead prend tout ce qui bloque les autres.* Personne n'attend.

| Qui | Possède |
|---|---|
| **Lead** | Déblocages, stockage, tarifs, chaîne IA, orchestration n8n |
| **Prince** | L'expérience produit : templates, éditeur de storyboard, Studio |
| **Mourchid** | Rendu Lambda, jobs, webhooks providers, publication YouTube, CI |
| **Yannick** | Catalogue de sons, statistiques, back-office |

## Roadmap du week-end

- [x] Socle : comptes, multi-tenant, crédits, paiement, storyboard, voix off
- [ ] Boucler la première vidéo de bout en bout (visuels + rendu)
- [ ] Publication YouTube réelle
- [ ] Notifications (vidéo prête / échec) par email ou WhatsApp
