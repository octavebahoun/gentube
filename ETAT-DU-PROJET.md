# GenTube — état du projet

**Date de la mesure : 14 septembre 2026.**
Tout ce qui suit a été relevé dans le code, pas dans la documentation.
Chaque chiffre est reproductible avec la commande donnée en annexe.

---

## 1. Ce qu'est GenTube

Un SaaS multi-tenant qui transforme **un prompt écrit en MP4 monté**.

Le client décrit sa vidéo. Un LLM écrit le storyboard — scène par scène :
la phrase que la voix lit, le visuel à fabriquer, l'effet à appliquer. Le client
corrige en kanban. Puis une chaîne asynchrone fabrique : la voix, les images,
les clips animés, le montage final, et la publication sur sa chaîne YouTube.

**Ce n'est pas un générateur d'un seul genre.** C'est un éditeur : le prompt du
client et ses réglages décident du résultat.

**Marché** : Afrique de l'Ouest. Facturation en FCFA, mobile money et carte.

**Ce qui est hors de portée aujourd'hui** : déposer sa propre vidéo pour la
faire monter. Recevoir des fichiers clients demande une capacité serveur qui
n'est pas là.

---

## 2. Le dépôt en chiffres

| Mesure | Valeur |
|---|---|
| Lignes de TypeScript / TSX (hors tests) | **42 291** |
| Commits | **189** |
| Modules métier (`lib/`) | **23** |
| Routes API | **24** |
| Pages | **17** |
| Composants React | **70** |
| Tables en base | **19** |
| Fichiers de test | **58** |
| Cas de test | **858** — tous passent |

### Où vit le code

| Module | Lignes | Fichiers | Ce qu'il fait |
|---|---|---|---|
| `lib/render/` | 5 431 | 18 | Le moteur de montage — composition, effets, plans, Lambda |
| `lib/storyboard/` | 5 234 | 15 | Le storyboard — découpage, cadrage, clips, voix off |
| `lib/db/` | 2 206 | 8 | Schéma Drizzle, isolation par tenant, migrations |
| `lib/video/` | 1 688 | 9 | Les trois fournisseurs d'animation + leurs webhooks |
| `lib/billing/` | 1 658 | 12 | Abonnements, cycles, résiliation, réveil |
| `lib/voice/` | 1 087 | 6 | Edge TTS, Amazon Polly, ElevenLabs |
| `lib/internal/` | 1 022 | 6 | Les cinq étapes que l'orchestrateur appelle |
| `lib/payments/` | 750 | 3 | SasPay — mobile money et carte, en XOF |
| `lib/credits/` | 715 | 3 | Le grand livre des crédits |
| *(14 autres modules)* | 3 000 | — | assets, sons, storage, transcription, agent, auth… |

**Le montage et le storyboard, à eux deux, font 25 % du code.** C'est le cœur,
et c'est cohérent : le reste est de la plomberie SaaS.

---

## 3. La pile

| Couche | Choix |
|---|---|
| Application | Next.js 15 (App Router) · TypeScript · React 19 |
| Base | PostgreSQL + Drizzle ORM |
| Interface | Tailwind 4 · `@base-ui/react` · `radix-ui` · Motion |
| Texte | **DeepSeek** (`deepseek-v4-flash`) |
| Images | Cloudflare Workers AI (`flux-2-klein-4b`) |
| Animation | **Replicate** (`prunaai/p-video`) · Novita et Atlas en option |
| Voix | Edge TTS (aperçu) · Amazon Polly Neural (Starter) · ElevenLabs (Pro) |
| Transcription | Cloudflare `whisper-large-v3-turbo` |
| Montage | AWS Lambda + Step Functions (HyperFrames) |
| Stockage | Cloudflare R2 |
| Paiement | SasPay (XOF) |
| Orchestration | n8n |
| Hébergement | Vercel — `gentube-nine.vercel.app`, branche `main` |

Base de départ : le template officiel Next.js SaaS Starter de Vercel.
**Toute la partie Stripe a été retirée** : la facturation passe par SasPay.

---

## 4. Ce qui marche, vérifié

### Les tests

```
858 tests passent · 58 suites sur 58 · 0 échec
pnpm typecheck : aucune erreur
```

Mesuré le 14 septembre 2026 à 00 h 48, en 216 secondes.

*(Au premier relevé, une suite échouait et le `typecheck` sortait deux erreurs :
le paquet `googleapis` était déclaré dans `package.json` mais absent de
`node_modules`. Un `pnpm install` a réparé les deux.)*

> **À surveiller** : pnpm ignore les scripts d'installation de `sharp`,
> `ffmpeg-static`, `esbuild` et `puppeteer`. Les tests n'en ont pas besoin ;
> un rendu lancé en local, peut-être. `pnpm approve-builds` si un binaire
> manque.

### Le pipeline, bout en bout

Les **13 actions serveur** de `app/(dashboard)/dashboard/videos/actions.ts`
exécutent chaque étape, et chacune est testée :

`createVideo` · `generateStoryboard` · `addShot` · `shotForm` · `monterApport` ·
`reorderShots` · `generateVoiceover` · `validateVideo` · `generateVisuals` ·
`animateNovita` · `renderVideo` · `videoSettings` · `deleteVideo`

Les **5 étapes internes** (`lib/internal/handlers.ts`) les exposent à
l'orchestrateur, avec isolation stricte par tenant :
`voice` · `images` · `clips` · `render` · `status`

Les **5 outils de l'agent** (`lib/agent/tools.ts`) les exposent à un LLM :
`generate_voiceover` · `generate_images` · `submit_clips` · `start_render` ·
`check_status`

### Le moteur de montage

- **43 effets** au catalogue (`lib/storyboard/effets.ts`) : `shockRing`,
  `auroraDrift`, `scanGate`, `whiteboardInk`, `notificationPileup`,
  `cameraRigDepthStack`, `keyframeScrubStack`…
- **19 structures** de plan (`lib/render/structures.ts`)
- **Rendu mesuré sur Lambda** : 16,4 s de vidéo montées en 34 s pour **0,0105 $**
- Une suite de régression visuelle (`render/regression/`) et une dizaine de
  vidéos de démonstration dans `render/demo/`

### Livré après le hackathon des 9-10 septembre

Les dix chantiers ouverts pour le hackathon ont été livrés sauf un :

| # | Chantier | État |
|---|---|---|
| 1 | Routes `/api/internal/*` | ✅ 6 routes |
| 2 | Workflow n8n | ✅ `n8n/pipeline-production.json` |
| 3 | Publication YouTube | ⚠️ code écrit, **pas branché** |
| 4 | Journal des événements | ✅ 17 appels à `logActivity` |
| 5 | Administration | ✅ 4 routes + écrans |
| 6 | Résiliation d'abonnement | ✅ routes + UI |
| 7 | CI | ✅ `.github/workflows/ci.yml` |
| 8 | Régie en direct (SWR) | ✅ |
| 9 | Statistiques YouTube | ❌ **aucune table** |
| 10 | Agent en tool calling | ✅ 5 outils |

---

## 5. Ce qui bloque — trois clés vides

Le code est écrit. **Le câblage ne l'est pas.**

Sur 42 variables d'environnement, **33 sont remplies et 9 sont vides.**
Six de ces neuf sont sans conséquence — le code retombe sur une valeur par
défaut. **Trois sont bloquantes** :

| Clé vide | Conséquence | Fichier |
|---|---|---|
| `INTERNAL_API_TOKEN` | L'API interne répond *« not configured »*. L'orchestrateur ne peut rien appeler. | `lib/internal/auth.ts:58` |
| `N8N_BASE_URL` *(+ `N8N_WEBHOOK_SECRET`, `N8N_API_TOKEN`)* | n8n n'est hébergé nulle part. Le workflow existe en JSON, il ne tourne pas. | `lib/internal/n8n.ts` |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | OAuth s'arrête avant le consentement. Aucune publication possible. | `lib/youtube/index.ts` |

### Les six sans conséquence

`R2_ENDPOINT` (déduit du compte) · `HYPERFRAMES_QUALITY` (valeur par défaut) ·
`ELEVENLABS_DEFAULT_VOICE_ID` (repli) — plus trois doublons.

### Ce que ça veut dire

> **Le parcours « compte → MP4 » n'a jamais été prouvé de bout en bout.**
>
> Chaque étape est testée isolément — 858 tests le disent. Aucune ne s'enchaîne
> automatiquement, parce que la pièce qui les enchaîne n'a pas d'adresse.
>
> C'est une soirée de configuration, pas un chantier de développement.

---

## 6. Ce qui n'existe pas encore

| Manque | Coût estimé |
|---|---|
| Statistiques YouTube (vues, durée regardée) | 1 table + 1 tâche planifiée |
| Chat agent côté client | l'agent existe, l'interface non |
| Notifications | — |
| Import de vidéos du client | capacité serveur, hors périmètre |
| Page 404 dessinée | 1 h |
| Ancres mortes sur la landing | 1 h |

---

## 7. L'économie

**Base : 1 $ = 625 FCFA.** Chiffré le 25 août 2026.

### Ce qu'une minute coûte

| Pipeline | Coût réel |
|---|---|
| Images fixes | **~400 FCFA / min** |
| Clips animés | **~775 FCFA / min** |

### Les plans

| Plan | Prix | Crédits | Ce que ça donne | Voix | Marge |
|---|---|---|---|---|---|
| Essai | gratuit | 120 | 1 min animée | Polly | — |
| Starter | 15 000 FCFA | 2 640 | 22 min animées ou 44 min d'images | Polly Neural | **41 %** |
| Pro | 30 000 FCFA | 5 400 | 45 min animées ou 90 min d'images | ElevenLabs | **40 %** |
| Recharge | 5 000 FCFA | 720 | 6 min animées | — | — |

La recharge est volontairement plus chère que l'abonnement : 833 FCFA/min
contre 682. Elle pousse vers l'abonnement.

**Frais de paiement SasPay : 3,25 % du chiffre d'affaires.**

---

## 8. Là où se situe GenTube

Le point de comparaison est Higgsfield : fondé en 2023, produit public début
2025, fondateur issu de la direction IA de Snap.

| | Higgsfield | GenTube |
|---|---|---|
| Plomberie SaaS | ✅ | ✅ |
| Moteur de montage | ✅ | ✅ **42 k lignes, 858 tests au vert** |
| Fournisseurs vidéo | ✅ | ✅ 3 branchés |
| Facturation locale | ❌ | ✅ **FCFA, mobile money** |
| Presets choisis par le client | ✅ **~50** | ❌ **4, choisis automatiquement** |
| Bibliothèque publique | ✅ | ❌ |

### L'écart tient en un fichier

`lib/storyboard/registres.ts:190`

GenTube a **quatre mouvements de caméra** — `dolly`, `pan`, `orbit`, `static` —
et ils ne sont **pas choisis par le client** : une règle d'alternance les
attribue selon la parité de la scène.

Un seul registre existe : `explainer`. Trois tons : `pose`, `appui`, `bascule`.

Higgsfield vend l'inverse : une cinquantaine de mouvements nommés, avec une
vignette, que le client choisit d'un clic. Chaque bouton est un prompt réglé à
la main jusqu'à ce qu'il marche à tous les coups.

> **L'écart n'est pas du code. C'est du réglage.**
> Le cadreur de prompts (`lib/storyboard/cadrage.ts`) fait déjà ce travail —
> à la volée, à chaque vidéo. Le figer en catalogue est un travail de
> réalisateur, pas de développeur.

---

## 9. Dette technique

**11 fichiers dépassent 500 lignes** (la limite du projet) :

| Fichier | Lignes |
|---|---|
| `lib/storyboard/render.ts` | 1 163 |
| `lib/db/schema.ts` | 1 162 |
| `components/ui/sidebar.tsx` | 743 |
| `lib/storyboard/service.ts` | 732 |
| `lib/render/plan.ts` | 616 |
| `lib/internal/handlers.ts` | 608 |
| `lib/storyboard/effets.ts` | 587 |
| `render/regression/run.ts` | 576 |
| `app/(dashboard)/page.tsx` | 533 |
| `lib/render/structures.ts` | 531 |
| `lib/render/composition.ts` | 529 |

Les deux premiers sont les vrais sujets. `schema.ts` se découpe par domaine
sans risque ; `storyboard/render.ts` demande plus de soin.

*(`composition.ts` était monté à 867 lignes — il est redescendu à 529.)*

---

## 10. Les trois prochains pas

### 1 — Prouver le parcours complet *(une soirée)*

Remplir les trois clés bloquantes, héberger n8n, et enregistrer une session :
inscription → prompt → MP4 téléchargé.

Tant que ce n'est pas filmé, tout le reste est une promesse.

### 2 — Sortir le catalogue de mouvements *(2 à 4 semaines)*

Cinq presets nommés, avec vignette, choisis par le client. Pas cinquante :
cinq qui marchent à tous les coups. C'est le seul écart produit avec Higgsfield.

### 3 — Fermer la boucle YouTube *(1 semaine)*

Les identifiants Google, la table de statistiques, et la vidéo qui revient au
client avec ses vues.

---

## Annexe — reproduire les mesures

```bash
# Lignes de code hors tests
find lib app components render design-system -name "*.ts" -o -name "*.tsx" \
  | grep -v "\.test\." | xargs wc -l | tail -1

# Tests
docker compose up -d && pnpm test

# Types
pnpm typecheck

# Clés d'environnement vides
awk -F= '/^[A-Z_]+=/ {v=substr($0,index($0,"=")+1); gsub(/^[ \t"]+|[ \t"]+$/,"",v); \
  if (length(v)==0) print $1}' .env

# Fichiers trop longs
find lib app components render -name "*.ts" -o -name "*.tsx" | grep -v test \
  | xargs wc -l | sort -rn | awk '$1>500 && $2!="total"'

# Mouvements de caméra
grep -n "cameraMotion" lib/storyboard/registres.ts
```
