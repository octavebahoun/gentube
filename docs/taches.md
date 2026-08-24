# GenTube — tâches à faire

Base : commit `65500f8`. Fait = auth, tenants, crédits, GeniusPay, projets,
vidéos, storyboard, voix off, sons, chiffrement. 236 tests verts.

---

## P0 — à faire avant de répartir le travail

Ces tâches bloquent les autres ou coûtent une migration si on les reporte.

### Sécurité stockage
- [ ] **Fermer l'accès public du bucket R2** — `R2_PUBLIC_URL` est une URL
      `pub-….r2.dev` : tout fichier est lisible sans authentification.
      Désactiver l'accès public, tout servir via `signedUrl()`.
- [ ] **Bucket dédié ou préfixe racine `gentube/`** — le bucket actuel
      (`renderx-videos`) vient d'un autre projet ; `assetKey()` préfixe par
      tenant à la racine, donc les deux produits partagent l'espace de noms.
      Gratuit maintenant, migration de fichiers plus tard.
- [ ] **`R2_ENDPOINT` est vide** — décider : déduit de l'account id
      (`https://<id>.r2.cloudflarestorage.com`) ou exigé en variable.

### Le seul vrai blocage technique
- [ ] **Implémenter `createAssetStore()`** dans `lib/storage/index.ts` —
      client S3 vers R2, `put()` + `signedUrl()`, + tests.
      ~100 lignes. Débloque : voix off, images, clips, rendu, musique.
- [ ] **Corpus de fixtures** — une vidéo entièrement voicée, durées mesurées,
      URLs d'assets bidon. Sans ça le front attend le back pendant 2 semaines.

### Migration Remotion → Hyperframes
- [ ] **Réécrire `lib/storyboard/render.ts`** — passer des frames aux
      **secondes** (`data-start` / `data-duration`). Supprime la conversion
      `Math.ceil` qui dérive contre l'audio réel.
      `MIN_SCENE_FRAMES`/`TRANSITION_FRAMES`/`POST_NARRATION_PAUSE_FRAMES`
      → 1 s / 0,5 s / 1 s.
- [ ] **`toRemotionStoryboard()` → `toHyperframesHtml()`** — on émet du HTML,
      plus du JSON. Décider : un template unique piloté par attributs, ou un
      template par pipeline.
- [ ] **Aligner l'enum des 9 transitions sur `shader-transitions`** — la
      colonne `render` (jsonb) est encore vide en base : gratuit aujourd'hui,
      migration de données demain.
- [ ] **Épingler les versions `@hyperframes/*`** — 0.8.x, 371 versions,
      plusieurs publications par jour. Pas de `^` sur du 0.x.
- [ ] **Nettoyer les mentions Remotion** — `lib/db/schema.ts` (2 commentaires),
      `README.md`, `docs/produit-et-wireframes.md`.

### Vérifications avant de figer l'UI
- [ ] **Lire le code de `@hyperframes/studio-server`** — l'éditeur Studio
      attend un serveur qui lit/écrit des compositions. Peut-il lire depuis R2
      avec un scope par tenant, ou suppose-t-il un dossier unique ?
- [ ] **Le panneau de code CodeMirror est-il désactivable ?** — Studio embarque
      un éditeur HTML/CSS/JS. Inacceptable côté client : exécution de JS
      arbitraire + support impossible. On veut la timeline et l'aperçu seuls.
- [ ] **Ouvrir une issue licence chez HeyGen** — aucun des 11 paquets
      `@hyperframes/*` ne déclare de champ `license` (npm affiche
      « Proprietary »). Le dépôt est Apache 2.0 : c'est un oubli de packaging,
      mais un audit de dépendances le verra. Garder une copie du `LICENSE`.

### Les 4 contrats à geler (sinon conflits garantis à 4 devs)
- [ ] **Jobs** — qui écrit dans `jobs`, vocabulaire exact de `step`, politique
      de reprise, et **où vit la vérité** : `videos.status` ou les lignes
      `jobs` ? Si les deux, elles divergeront.
- [ ] **n8n ↔ Next.js** — dans quel sens ça appelle, quelle auth, et qui
      détient les clés providers.
- [ ] **Plan de nommage R2** — un seul tableau, lu par les 4 :
      voix / image / clip / rendu / musique.
- [ ] **Publication** — aucune table n'existe, juste `videos.youtube_video_id`
      et `published_at`. Il manque le compteur de quota (10 000 unités/jour
      pour toute la plateforme = ~6 uploads/jour) et la programmation.
- [ ] **Un seul propriétaire du schéma** — 4 devs qui lancent `drizzle-kit`
      = conflit sur `_journal.json` à chaque fois.

---

## Décisions qui n'appartiennent qu'à toi

Ce ne sont pas des tâches à déléguer.

- [x] **720p : 3 crédits/s** — tranché. Le 480p est à 1 crédit/s, et le 720p
      coûte réellement 2,1× plus cher. Facturé 3×, la marge y reste à 58 %
      sans donner de prise à un concurrent. **Le code est encore à 4.**
- [ ] **Recharge 5 000 FCFA : 3 000 crédits → ~450** — à 40 % de marge.
      Aujourd'hui elle vend 50 min (20 000 FCFA de coût) pour 5 000.
- [x] **Marge cible 40 %**, 5 mois à perte assumés, tarif gelé 1 an pour
      les 15 premiers clients.
- [x] **Amazon Polly remplace ElevenLabs** par défaut (5× moins cher) ;
      ElevenLabs réservé aux plans Pro et Business.
- [x] **Minutes incluses corrigées** : Starter 22 min, Pro 45 min, prix
      inchangés. Une minute de 480p coûte 400 FCFA, 850 en 720p.
- [x] **Crédits de plan : ils expirent** — tranché. Ils disparaissent à la fin
      du cycle, ils ne s'accumulent pas.
- [x] **Les crédits achetés en recharge n'expirent jamais** — tranché, et non
      négociable : faire expirer ce qu'un client a payé, c'est du vol.
      **Conséquence :** deux poches distinctes dans le solde, alors que
      `credit_ledger` n'en connaît qu'une aujourd'hui.
- [x] **Ordre de débit : la poche qui expire d'abord** — tranché. Sinon le
      client perd de la valeur qu'il aurait pu consommer.
- [x] **Images : Flux via Cloudflare Workers AI** — tranché. Replicate ne
      sert plus qu'aux clips vidéo.
- [x] **Studio embarqué** — tranché. Les deux vérifications P0 deviennent des
      prérequis bloquants, plus des questions ouvertes.
- [ ] **Qui relit Yannick** — Mourchid ou toi ? (≈20-30 % du temps du relecteur)
- [ ] **Landing publique maintenant ou plus tard ?**
- [ ] **Rendu Lambda → R2** — le rendu Lambda écrit vers S3, on stocke sur R2.
      R2 est compatible S3, donc peut-être direct ; sinon copie après rendu.

---

## Toi — chaîne IA et orchestration

Tu possèdes **ce que la vidéo raconte**.

- [ ] Prompts et qualité de sortie du storyboard (`lib/llm/`)
- [ ] Génération d'images — Flux (Workers AI ou Replicate), `shots.asset_url`
- [ ] Génération de clips vidéo — Replicate
- [ ] Orchestration n8n : voix off → images → clips → rendu → publication
- [ ] **Notifications** (vidéo prête, paiement échoué) — géré par n8n,
      pas par l'app. Retiré du périmètre de Yannick.
- [ ] Politique de reprise sur échec provider
- [ ] Réglage des coûts par vidéo (le prix en crédits doit rester tenable)
- [ ] Arbitrages produit de la liste ci-dessus

---

## Prince — surface produit et rendu visuel

Fullstack, fort en front. Il possède **à quoi la vidéo ressemble**.

**Règle non négociable :** le rendu *seek* chaque frame. Animations pilotées
par du temps **déclaré**, jamais par du temps accumulé (`requestAnimationFrame`).
Une animation parfaite dans l'aperçu qui se casse au rendu, c'est le piège
classique de cette approche.

- [ ] Templates HTML/CSS/GSAP des vidéos + `shader-transitions`
- [ ] Éditeur de storyboard : réordonnancement, timings, régénération par scène
- [ ] Intégrer `<hyperframes-player>` pour l'aperçu et le scrub
- [ ] **UI de sound design** — le modèle porte les SFX par scène avec leurs
      pics d'impact ; rien ne les expose aujourd'hui
- [ ] Écran de production en direct (avancement des jobs)
- [ ] Réglages vidéo : ratio, voix, style de sous-titres, musique
      (tout est en base, aucune UI)
- [ ] Bibliothèque de vidéos avec filtres
- [ ] UX d'erreur et de reprise quand un job échoue
- [ ] Onboarding / premier lancement
- [ ] Landing + page tarifs (si tranché)
- [ ] **Il possède seul la coquille partagée** : nav, layout, `components/ui`

---

## Mourchid — infra et publication

Fullstack surtout back. Le back le plus exigeant qui reste.

- [ ] **`createAssetStore()` vers R2 — jour 1, priorité absolue**
- [ ] Propriétaire du schéma et des migrations
- [ ] `lib/jobs/` — file, reprises, sémantique des statuts
- [ ] Rendu Lambda : `hyperframes lambda deploy / render / progress`
- [ ] Webhooks providers (Replicate, Lambda) — `jobs.external_id` est déjà
      unique pour qu'un webhook rejoué résolve exactement un job
- [ ] YouTube : OAuth, rafraîchissement des tokens (`lib/crypto/encryption.ts`
      existe déjà), upload résumable
- [ ] Compteur de quota YouTube (10 000 unités/jour, plateforme entière)
- [ ] Programmation des publications
- [ ] CI
- [ ] Relecture du code de Yannick

---

## Yannick — catalogue, lectures, écrans internes

Back, novice, travail relu. Tâches bornées, où un bug **se voit**.

**Interdits, sans exception :** `lib/credits/`, `lib/billing/`,
`lib/payments/`, `lib/db/tenant-db.ts`.
Un bug dans le grand livre de crédits double-crédite sans rien casser à
l'écran ; un bug dans `tenantDb()` montre les vidéos d'un client à un autre.
Ni l'un ni l'autre ne se voit en relisant un diff.

**Règle :** le test avant le code.

- [ ] **Corpus de fixtures — sa première tâche, elle débloque Prince**
- [ ] Import du catalogue de 51 sons (`lib/sounds/import-catalog.ts` existe)
- [ ] Monter les fichiers audio du catalogue sur R2
- [ ] CRUD d'administration du catalogue de sons
- [ ] Stats (J13) — que des SELECT, déjà scopés par `tenantDb()` dont le test
      d'isolation existe
- [ ] Back-office en lecture seule
- [ ] Enrichissement du journal d'activité

---

## Séquence

Semaine 1 a une tête série incompressible : personne ne teste de bout en bout
avant R2 + un provider d'image + le rendu.

1. Mourchid : R2. Yannick : fixtures. Prince : templates sur fixtures.
   Toi : images.
2. Première vidéo complète : fin de semaine 2, réalistement.

## Reste à planifier

- [ ] Expiration des quotas de plan
- [ ] Limitation de débit
- [ ] Observabilité / logs
- [ ] Recette de bout en bout (J14)
- [ ] Surveillance du plafond GeniusPay : 500 000 FCFA/mois, commission 1,5 %
