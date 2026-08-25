# Moi — débloquer l'équipe, puis la chaîne IA

Je prends **toutes les tâches qui bloquent quelqu'un d'autre**. Les trois
autres ne doivent jamais attendre après moi.

> ⚠️ **Conséquence assumée :** je deviens le chemin critique de toute
> l'équipe. Si je prends du retard, Prince, Mourchid et Yannick s'arrêtent —
> pas seulement moi. Tant que la partie A n'est pas finie, elle passe avant
> mon propre couloir.

---

# Partie A — Ce qui débloque les autres

Dans l'ordre. Chaque tâche indique qui elle libère.

## A1. Sécuriser R2 avant la première écriture

> Débloque : tout. Et devient une migration de fichiers si on le fait après.

- [ ] **Fermer l'accès public du bucket.** `R2_PUBLIC_URL` est une URL
      `pub-….r2.dev` : n'importe qui devinant un chemin lit la vidéo d'un
      client. Tout doit passer par `signedUrl()`.
- [ ] **Bucket dédié, ou préfixe racine `gentube/`.** Le bucket actuel
      (`renderx-videos`) vient d'un autre projet, et `assetKey()` préfixe par
      tenant à la racine : les deux produits partageraient l'espace de noms.
- [ ] **`R2_ENDPOINT` est vide.** Déduit de l'account id
      (`https://<id>.r2.cloudflarestorage.com`) ou exigé ? Documenter dans
      `.env.example`.

## A2. Implémenter `createAssetStore()`

> Débloque : la voix off, les images, les clips, le rendu, et l'upload des
> sons par Yannick. C'est **le** blocage du projet.

Le contrat est déjà écrit et figé dans `lib/storage/index.ts` :

```ts
export interface AssetStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
```

R2 est compatible S3 : `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
~100 lignes avec les tests.

**Ne pas toucher** à `assetKey()` ni `keyBelongsToTenant()` : ils sont testés,
et `assetKey()` refuse déjà les segments de traversée (`..`).

**Fini quand :** `generateVoiceover()` écrit un vrai MP3 sur R2.

## A3. Le corpus de fixtures

> Débloque : **Prince, entièrement.** Sans lui il attend deux semaines.

Un jeu de données insérable en une commande :

- un tenant, un projet, une vidéo
- 5 à 6 plans avec `narration` + `prompt`, `duration_s` cohérente
  (~14 caractères/seconde), `duration_source: 'measured'`
- `words` : les timings **mot à mot** — Prince en a besoin pour le karaoké
- `audio_url` et `asset_url` : des URLs bidon mais bien formées
- des variantes : brouillon, en production, échouée, publiée

`lib/db/seed.ts` existe déjà, il suffit de l'étendre.

## A4. Migrer le contrat de rendu vers Hyperframes

> Débloque : Prince (les templates), Mourchid (le rendu Lambda).

- [ ] **`lib/storyboard/render.ts` : frames → secondes.** Hyperframes déclare
      `data-start` / `data-duration` en secondes. Ça supprime la conversion
      `Math.ceil` qui dérive contre l'audio réel.
      `MIN_SCENE_FRAMES` / `TRANSITION_FRAMES` / `POST_NARRATION_PAUSE_FRAMES`
      → 1 s / 0,5 s / 1 s.
- [ ] **`toRemotionStoryboard()` → `toHyperframesHtml()`.**
- [ ] **Aligner l'enum des 9 transitions sur `shader-transitions`.** La
      colonne `render` (jsonb) est vide en base : gratuit aujourd'hui,
      migration de données demain.
- [ ] **Épingler `@hyperframes/*` à la version exacte.** 0.8.x, 371 versions,
      plusieurs publications par jour.
- [ ] Nettoyer les mentions Remotion : `lib/db/schema.ts` (2 commentaires),
      `README.md`.

## A5. Vérifier Studio avant que Prince l'intègre

> Débloque : Prince.

- [x] **Lire le code de `@hyperframes/studio-server`** — fait.
      `createStudioApi(adapter)` renvoie une sous-application Hono, et
      l'adaptateur est un vrai point d'extension : `resolveProject(id)`,
      `bundle(projectDir)`, `startRender(...)`. Il existe même un mode
      multi-projets explicite (`resolveSession`).
      **L'isolation par tenant se pose dans `resolveProject()`** — c'est notre
      code, donc `tenantDb()` s'applique comme partout ailleurs.
- [x] **Le panneau de code est masquable** — fait, et mieux que prévu : le
      paquet expose des composants séparés. On monte `Timeline` + `NLEPreview`
      + `Player` et on ne monte jamais `SourceEditor`.
- [ ] **Conséquence à trancher : Studio veut un disque.** `ResolvedProject`
      est `{ id, dir }`, et tout le serveur travaille sur des dossiers —
      `bundle(projectDir)`, `rendersDir()`, `walkDir()`, un watcher de fichiers.
      Une session d'édition a donc besoin d'un **répertoire de travail réel**,
      pas seulement d'objets R2. Ça exclut l'édition sur du serverless : il
      faut un hôte avec un disque, plus une étape « matérialiser depuis R2 »
      à l'ouverture et « repousser vers R2 » à la fermeture.

Maquette de référence : `docs/wireframes/13-studio-hyperframes.svg`.

## A6. Appliquer les tarifs dans le code

> Débloque : Prince (affichage des prix) et Yannick (stats).

Dans `lib/credits/pricing.ts` :

- [x] `CREDITS_PER_SECOND['720p']` : 4 → **3**
- [x] `PLAN_MONTHLY_CREDITS` : starter 1 333 → **1 320**, pro 3 000 → **2 700**
- [x] Pack de recharge : 3 000 → **360 crédits**
- [x] Mettre à jour les assertions de `lib/credits/pricing.test.ts`

## A7. Les deux poches de crédits

> Débloque : Mourchid (schéma) et Prince (écran de facturation).

Les crédits de plan **expirent** en fin de cycle, les crédits **achetés
n'expirent jamais**. Or `credit_ledger` ne connaît qu'un solde.

- [ ] Séparer les deux poches
- [ ] Débiter **en premier celle qui expire**

C'est le chemin monétaire : transaction, clé d'idempotence, un test par cas
de bord.

## A8. Écrire les quatre contrats — fait

> Écrits dans `docs/contrats.md`.

> Débloque : tout le monde. Sans eux, quatre devs improvisent la même chose
> différemment.

- [ ] **Jobs** — vocabulaire exact de `step`, politique de reprise, et
      **où vit la vérité** : `videos.status` ou les lignes `jobs` ? Si les
      deux, elles divergeront.
- [ ] **n8n ↔ Next.js** — sens des appels, authentification, et qui détient
      les clés providers.
- [ ] **Plan de nommage R2** — un tableau : voix, image, clip, rendu, musique.
      Le catalogue de sons est hors tenant, il lui faut son propre préfixe.
- [ ] **Publication** — aucune table n'existe. Il manque le compteur de quota
      YouTube (10 000 unités/jour pour toute la plateforme, ~6 publications)
      et la programmation.

## A9. Une migration de schéma consolidée — fait

> Migration `0004`. Deux poches de crédits, `publications`, `youtube_quota_usage`.

> Débloque : tout le monde. Quatre devs qui lancent `drizzle-kit` = conflit
> sur `_journal.json` à chaque fois.

- [ ] Regrouper ce qu'on sait déjà (deux poches de crédits, publications,
      quota YouTube) en **une seule** migration, puis ne plus y toucher cette
      semaine.
- [ ] Ensuite, passer la main : **Mourchid devient propriétaire du schéma.**

---

# Partie B — Décisions qui restent

- [ ] **Qui relit Yannick** — Mourchid ou moi ? (≈25 % du temps du relecteur)
- [ ] **Landing publique** maintenant ou plus tard ? → bloque Prince
- [ ] Corriger les 7 wireframes périmés (`docs/wireframes-a-corriger.md`)
- [ ] Régénérer `CATALOG.md` : 51 → 60 sons (`npm run sounds` dans pipevideo)

Déjà tranché : tarifs, marge 40 %, Polly par défaut, ElevenLabs en premium,
720p à 3 crédits/s partout, Hyperframes, Studio embarqué, Lambda,
templates chez Prince. Voir `docs/tarifs.md`.

---

# Partie C — Mon couloir, une fois la partie A finie

Je possède **ce que la vidéo raconte**.

## Images — Flux sur Cloudflare Workers AI

`CLOUDFLARE_AI_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` sont déjà dans `.env`.
Écriture dans `shots.asset_url`, via `AssetStore.put()`. Jamais de client S3
en direct.

## Clips — `wan-video/wan-2.2-i2v-fast`

Image-to-video : on anime l'image déjà générée au lieu de repartir de zéro.
Moins cher, et cohérent avec le storyboard.

Facturation **par vidéo générée**, pas par seconde : 81 images à 16 fps font
5,06 s de clip, à 0,05 $ en 480p et 0,11 $ en 720p. L'option
`interpolate_output` (30 fps) fait monter à 0,065 $ et 0,145 $.

Asynchrone : `jobs.external_id` est déjà **unique** pour qu'un webhook rejoué
résolve exactement un job. Le motif à suivre existe et est testé :
`lib/billing/webhook.ts`.

## Qualité du storyboard — `lib/llm/`

DeepSeek `deepseek-v4-flash`. **Piège déjà rencontré :** ce sont des modèles
de raisonnement — avec un budget de tokens trop serré, ils dépensent tout en
raisonnement et renvoient un contenu vide. Le client lève une erreur explicite.

Le prompt interdit au modèle d'écrire une durée, le serveur force le type de
scène et supprime les sons inventés. **Ne relâcher aucune des trois.**

Calibrage : ~14 caractères de narration par seconde d'audio. Si les voix
changent, ce nombre change.

## Orchestration n8n

Séquence : voix off → images → clips → rendu → publication.

## Notifications — via n8n, hors application

- [ ] Vidéo prête · vidéo échouée · paiement échoué (3 tentatives max) ·
      solde bas
- [ ] Canal : email ou WhatsApp, vu le marché

## Reprise sur échec

Les providers échouent régulièrement. Combien de tentatives, quel délai, et
**qui paie** quand un plan est régénéré ? C'est une question d'argent autant
que de technique.

## Coût réel

Une minute de 480p coûte ~400 FCFA, une minute de 720p ~850 FCFA.
Détail dans `docs/tarifs.md`.

Plafonds externes : GeniusPay 500 000 FCFA/mois (commission 1,5 %),
YouTube ~6 publications/jour pour toute la plateforme.
