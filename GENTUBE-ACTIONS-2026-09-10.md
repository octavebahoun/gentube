# Gentube — récapitulatif complet des actions (bots + Chief of Staff)

**Repo :** [`octavebahoun/gentube`](https://github.com/octavebahoun/gentube)  
**Site :** https://gentube-nine.vercel.app  
**Branche de travail :** `ai-video-saas` (default GitHub)  
**Branche Production Vercel :** `main`  
**Date du récap :** 10 septembre 2026 (Africa/Porto-Novo, UTC+1)  
**Rédigé par :** Chief of Staff (orchestration)  
**Dernière mise à jour :** après validation OAuth YouTube + URI Google

---

## 0. Verdict final (état à la clôture de la vague)

| Élément | État |
|---|---|
| Production live | Ready sur `main@5b97600` (après force redeploy Cosme) |
| Routes API métier | Plus de 404 HTML ; 401 attendus sans session |
| Direction C (rouge + violet) | Live |
| YouTube Connect UI | OK → Google OAuth (STOP avant consent) |
| Google redirect URI | Ajoutée par Octave ; plus de `redirect_uri_mismatch` |
| Billing cancel UI | Mergée ; invisible sur Starter seed = **voulu** |
| `/en/*` | Redirect FR OK |
| Provider vidéo à créditer | **Replicate** `prunaai/p-video` (pas Atlas) |

**Reste ouvert (non bloquant jour 1) :** page 404 générique noire ; ancres landing mortes ; E2E compte→MP4 non prouvé ; backlog produit (chat agent, stats YT, notifs, HyperFrames, plans animés) ; auto-deploy Vercel flaky ; PRs Jules #3–#6 ouvertes.

---

## 1. Contexte entreprise

Gentube = SaaS vidéo IA (« Décrivez. On monte. »).  
Octave = **sponsor / décideur** (tranches, blocages, merges sensibles, secrets Google).  
Les bots livrent en PRs vers `ai-video-saas` ; **Merge Gentube** squash sans review continue.  
Vercel Production suit **`main`** → chaque vague utile est sync `ai-video-saas` → `main`.

**Provider vidéo v1 :** Replicate (`prunaai/p-video` 1080p), `REPLICATE_API_TOKEN`, `VIDEO_PROVIDER=replicate` par défaut. Atlas = option code hors v1.

---

## 2. Équipe

| Bot | Rôle |
|---|---|
| Dispatcher Gentube | Orchestre les voies / vagues |
| Ezechiel | `/api/internal`, isolation tenant, résiliation |
| Prince | Activity journal, YouTube API + UI + fix Connect |
| Ahmad | Fabrication live, copy, admin UI, billing cancel UI |
| Merveille | Agent tools + API admin |
| Cosme | CI, secrets, n8n, Vercel, Google OAuth diag |
| Merge Gentube | Merge bots → `ai-video-saas` + sync `main` |
| API Gentube | Inventaire + tests HTTP live |
| QA UI Gentube | Parcours UI↔API + captures |
| UI Gentube | Design system Direction C |
| Chief of Staff | Orchestration, sync/fix PRs, briefings |

---

## 3. Vague jour 1 — livraison code (#7–#14)

| PR | Titre | Qui | Statut |
|---|---|---|---|
| #7 | CI + doc env | Cosme | Mergée |
| #8 | Journal activity | Prince | Mergée |
| #9 | Internal isolation + cancel_at | Ezechiel | Mergée |
| #10 | Fabrication live SWR | Ahmad | Mergée |
| #11 | Copy voix | Ahmad | Mergée |
| #12 | Agent tools + admin API | Merveille | Mergée |
| #13 | Admin UI jobs | Ahmad | Mergée |
| #14 | YouTube OAuth + upload API | Prince | Mergée |

**n8n :** workflow `GenTube — production` aligné (webhook actif).

---

## 4. Problèmes rencontrés → échecs → solutions (journal incident)

### P1 — Décalage deploy / 404 massifs

| | |
|---|---|
| **Symptôme** | Live : fabrication, admin/*, youtube/*, billing cancel, internal/* → **404 HTML**. Seuls `/api/user`, `/api/tenant`, webhooks OK. |
| **Impact** | QA/API bloqués ; régie + admin cassés. |
| **Cause** | `main` (Production Branch) en retard sur `ai-video-saas`. |
| **Échec intermédiaire** | Merge #15 sur `main` → **build Vercel Error** (Turbopack). Prod restait sur ancien commit `e50dde3` Ready/Stale. |
| **Cause build** | Turbopack parsait le **binaire esbuild** (non-UTF-8) + `maxDuration` non littéral sur routes internal. |
| **Solution** | PR #16 (`serverExternalPackages` + `maxDuration = 300`) → #18 sync `main` → Production Ready ; routes → 401. |
| **Qui** | API/QA détection ; Cosme dashboard ; CoS cloud agent #16 ; Merge/CoS sync. |

### P2 — Publish internal 500

| | |
|---|---|
| **Symptôme** | `POST /api/internal/publish` sans token → **500** ; autres internal → 401. |
| **Cause** | `toResult()` dans `publish.ts` ne mappe pas `InternalAuthError`. |
| **Solution** | PR #19 → 401 ; #20 sync main ; confirmé live. |
| **Qui** | API Gentube ; Ezechiel ; Merge. |

### P3 — Design : rouge maquettes vs orange code

| | |
|---|---|
| **Symptôme** | Maquettes SVG rouge/noir ; code live orange+violet. |
| **Décision Octave** | Direction **C** : rouge marque + violet IA. |
| **Solution** | PR #17 (tokens + auth/shell + vague 2) → #26 sync main. |
| **Qui** | UI Gentube ; go merge Octave ; Merge. |

### P4 — `/en/*` écran noir

| | |
|---|---|
| **Symptôme** | `/en/…` → 404 HTML + écran noir. |
| **Cause** | Pas d’i18n ; Next ne matche pas le préfixe. |
| **Solution** | PR #21 middleware redirect locales → FR ; #23 sync. |
| **Résultat QA** | `/en/` et `/en/dashboard` OK. |
| **Reste** | `/does-not-exist` / page 404 générique encore noire (P2). |

### P5 — Trous UI (YouTube / billing cancel)

| | |
|---|---|
| **Symptôme** | APIs YouTube + billing cancel sans UI. |
| **Solution** | #22 YouTube UI (Prince) ; #24 billing cancel UI (Ahmad) ; #25 sync. |
| **Échec deploy** | Auto-deploy Vercel **n’a pas créé** de deploy pour #25/#26 ; prod stuck `4bc3d2f`. |
| **Solution ops** | Cosme **force Redeploy** tip `9cca998` → Ready. |

### P6 — Bouton Connecter YouTube → `#studio`

| | |
|---|---|
| **Symptôme** | UI présente mais clic → `/#studio` (pas OAuth). |
| **Hypothèses** | Authorize mal formé vs click handler JS. |
| **Cause retenue** | `onClick` + `window.location.href` peu fiable (handler / GxButton). |
| **Solution** | PR #27 : `GxButton href="/api/youtube/authorize"` (`<a>`) ; #28 sync. |
| **Échec deploy** | Auto-deploy muet encore ; Cosme force redeploy `5b97600`. |
| **Résultat QA** | Clic → Google OAuth. |

### P7 — Google `redirect_uri_mismatch`

| | |
|---|---|
| **Symptôme** | Error 400 après fix UI. |
| **Cause** | Console Google n’avait que l’URI **n8n** ; pas celle Gentube. |
| **URI requise** | `https://gentube-nine.vercel.app/api/youtube/callback` (`${BASE_URL}/api/youtube/callback`) |
| **Vercel** | `BASE_URL` + `YOUTUBE_CLIENT_*` OK. |
| **Solution** | Octave ajoute l’URI lui-même dans Google Cloud Console. |
| **Résultat QA** | Plus de mismatch ; écran Google challenge OK (STOP avant consent). |

### P8 — Billing cancel invisible sur Starter (faux positif QA)

| | |
|---|---|
| **Symptôme** | Pas de Cancel/Revert sur compte Starter seed. |
| **Verdict** | **Pas un bug.** Boutons si `subscription` + `status === 'active'` + role manage. Starter seed = `tenants.plan` sans ligne `subscriptions`. |
| **Action** | Aucune PR ; point QA clos. |

### P9 — Auto-deploy Vercel flaky (récurrent)

| | |
|---|---|
| **Symptôme** | Merges `main` sans nouveau deploy (HIT cache / tip non buildé). |
| **Workaround** | Cosme force Redeploy Production depuis tip `main`. |
| **Risque** | À surveiller en production ; envisager alerte ou check post-merge. |

---

## 5. Chronologie condensée (10/09)

1. Clarification provider → Replicate.  
2. Création bots API / QA UI / UI Gentube.  
3. Audit API → 404 massifs ; QA confirme P0.  
4. #15 sync main → build Turbopack KO.  
5. #16+#18 fix build → routes 401.  
6. #19+#20 publish 401.  
7. Direction C choisie → #17+#26.  
8. #21+#23 `/en` ; #22+#24+#25 YouTube UI + billing ; force redeploy `9cca998`.  
9. QA : Connect → `#studio` ; #27+#28 + force `5b97600`.  
10. `redirect_uri_mismatch` → Octave ajoute URI → OAuth OK.

---

## 6. Tableau PRs consolidé

| # | Titre | Mergée | Notes |
|---|---|---|---|
| 1–2 | Fondations / DS landing | Oui | Pré-bots |
| 3–6 | Palette a11y Jules | **Non** | Ouvertes hors vague |
| 7–14 | Vague jour 1 bots | Oui | Voir §3 |
| 15 | Sync déblocage main | Oui | CoS |
| 16 | Fix Turbopack | Oui | CoS cloud |
| 17 | Direction C UI | Oui | UI Gentube |
| 18 | Sync #16 | Oui | |
| 19 | Publish 401 | Oui | Ezechiel |
| 20 | Sync #19 | Oui | |
| 21 | Redirect `/en/*` | Oui | CoS cloud |
| 22 | YouTube OAuth UI | Oui | Prince |
| 23 | Sync #21 | Oui | |
| 24 | Billing cancel UI | Oui | Ahmad |
| 25 | Sync #22+#24 | Oui | |
| 26 | Sync #17 | Oui | |
| 27 | Fix YouTube Connect href | Oui | Prince |
| 28 | Sync #27 | Oui | |

---

## 7. Findings QA / API (final)

### Résolus
- Deploy gap / 404 API  
- Build Turbopack  
- Admin noir (lié 404)  
- Publish 500 → 401  
- `/en` noir (préfixe locale)  
- YouTube sans UI + Connect `#studio` + redirect_uri  
- Direction C tokens  

### Faux positifs / by design
- Billing cancel absent Starter seed  

### Encore ouverts
- 404 générique noir  
- Ancres landing mortes  
- E2E MP4 réel  
- Backlog produit (agent chat UI, stats YT, notifs, etc.)  
- Auto-deploy Vercel à fiabiliser  
- Jules #3–#6  

---

## 8. Design Direction C

| Token | Usage |
|---|---|
| `#FF3B30` / `#D0021B` | Rouge marque, CTA, nav |
| `#A855F7` | Violet IA |
| `#FFB340` | Info / in-progress |
| Maquettes | `docs/maquettes/` + `docs/wireframes/` (rouge/noir source) |

---

## 9. Infra / secrets (noms seulement)

- Vercel Production Branch = `main` ; domain gentube-nine.vercel.app  
- Env clés (non secrètes listées) : `DATABASE_URL`, `BASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `N8N_*`, `INTERNAL_API_TOKEN`, `YOUTUBE_CLIENT_ID`/`SECRET`, Replicate, R2, DeepSeek, ElevenLabs, Cloudflare AI, SasPay…  
- Google OAuth redirect obligatoire : `https://gentube-nine.vercel.app/api/youtube/callback`  
- n8n : `https://n8n-itenet.duckdns.org`  

---

## 10. Leçons / process

1. **Toujours sync `main` + vérifier Vercel Ready** après merge (ne pas faire confiance à l’auto-deploy).  
2. Turbopack + binaires natifs (esbuild) → externaliser.  
3. Segment config Next (`maxDuration`) = littéraux.  
4. OAuth : URI console Google **exacte** + même client que Vercel.  
5. Boutons JS fragiles → préférer `<a href>` pour navigation critique.  
6. QA seed ≠ abo payant : lire le gating avant d’ouvrir un bug UI.  
7. Maquettes SVG et code peuvent diverger : trancher Direction avant PR massives.

---

## 11. Qui a porté quoi

- **CoS :** bots QA/API/UI ; #15/#16/#18/#21 ; orchestration incidents ; récap.  
- **Cosme :** Vercel diag, force redeploy, URI Google diag, CI/n8n.  
- **Merge :** squash + syncs #20/#23/#25/#26/#28.  
- **Ezechiel :** #9, #19.  
- **Prince :** #8, #14, #22, #27.  
- **Ahmad :** #10, #11, #13, #24 + clarification gating.  
- **Merveille :** #12.  
- **UI Gentube :** Direction C #17.  
- **API / QA :** détection, retests, validation OAuth.  
- **Octave :** Direction C ; go merges ; URI Google manuelle ; sponsor.

---

## 12. Liens

- Live : https://gentube-nine.vercel.app  
- Repo : https://github.com/octavebahoun/gentube  
- PRs clés : #16 Turbopack · #17 Direction C · #19 publish · #21 locales · #22/#27 YouTube · #24 billing · #28 sync final  

---

*Document de passation entreprise — problèmes, échecs, solutions, état final. Mis à jour après validation OAuth YouTube (10/09/2026).*
