# Mourchid — infra et publication

Tu possèdes le **socle technique** : le stockage, la file de jobs, le rendu et
la publication YouTube. Tu es aussi **propriétaire du schéma** et **relecteur
du code de Yannick**.

Stack : Next.js 15 (App Router), Drizzle ORM, PostgreSQL, Vitest.
Base de dev : Docker local. Tests : base `postgres_test` séparée,
`fileParallelism: false`.

---

## 1. Adaptateur R2 — jour 1, priorité absolue

**C'est le seul vrai blocage du projet.** Sans lui : pas de voix off, pas
d'images, pas de clips, pas de rendu. Trois personnes attendent.

Le contrat est déjà écrit et figé dans `lib/storage/index.ts` :

```ts
export interface AssetStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
```

Il ne te reste qu'à faire renvoyer un vrai client S3 par `createAssetStore()`.
R2 est compatible S3 : `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

**Ne touche pas** à `assetKey()` ni à `keyBelongsToTenant()` : ils sont testés,
et `assetKey()` refuse déjà les segments de traversée (`..`) — un test le
vérifie explicitement.

Variables déjà présentes dans `.env` : `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ENDPOINT` (vide).

**Trois problèmes à régler dans la même passe :**

1. **Le bucket est en accès public.** `R2_PUBLIC_URL` est une URL
   `pub-….r2.dev` : tout fichier est lisible sans authentification. Désactive
   l'accès public, sers tout via `signedUrl()`. Sans ça, l'isolation
   multi-tenant qu'on a construite en base ne protège rien.
2. **Le bucket `renderx-videos` vient d'un autre projet.** `assetKey()`
   préfixe par tenant à la racine (`7/voice/…`), donc les deux produits
   partageraient l'espace de noms. Bucket dédié, ou préfixe racine `gentube/`.
   Gratuit maintenant, migration de fichiers plus tard.
3. **`R2_ENDPOINT` est vide.** Décide : déduit de l'account id
   (`https://<id>.r2.cloudflarestorage.com`) ou exigé en variable, et
   documente-le dans `.env.example`.

**Fini quand :** `generateVoiceover()` écrit un vrai MP3 sur R2 et
`lib/storyboard/voiceover.test.ts` passe contre le vrai store.

---

## 2. Plan de nommage R2

Un seul tableau, que les quatre devs lisent. À écrire avant que quiconque
écrive un fichier.

Couvre : voix (`{tenant}/voice/{videoId}/{shotId}.mp3`), images, clips, rendu
final, musique. Le catalogue de sons est **hors tenant** (table `sound_assets`,
partagée par tous) — il lui faut son propre préfixe.

---

## 3. File de jobs — `lib/jobs/`

La table `jobs` existe déjà : `step`, `external_id` (**unique**, pour qu'un
webhook rejoué résolve exactement un job), `status`, `payload`, `attempts`.

À définir, et c'est un contrat que les 4 devs suivront :

- Le **vocabulaire exact de `step`** (`voiceover`, `image`, `clip`,
  `render`, `publish` — à figer).
- La **politique de reprise** : combien de tentatives, quel délai.
- Et surtout : **où vit la vérité** de « où en est cette vidéo » ?
  Dans `videos.status` ou dans les lignes `jobs` ? Si les deux, elles
  divergeront et personne ne saura laquelle croire.

---

## 4. Rendu Hyperframes sur Lambda

On a quitté Remotion (licence payante au-delà de 3 personnes) pour
**Hyperframes** de HeyGen (Apache 2.0, HTML → MP4).

`@hyperframes/aws-lambda` fournit déjà `hyperframes lambda deploy`,
`lambda render`, `lambda progress`. Donc c'est surtout de la configuration.

Le moteur est **Chrome headless + FFmpeg** : Node 22 requis.

**Une question d'intégration à trancher :** le rendu Lambda écrit
naturellement vers S3, nous stockons sur R2. R2 est compatible S3, donc c'est
peut-être direct — sinon c'est une copie après rendu. À décider, pas à
improviser.

**Épingle les versions `@hyperframes/*` à l'exact.** 0.8.x, 371 versions
publiées, plusieurs par jour. Un `^` sur du 0.x = des ruptures en silence.

---

## 5. Webhooks providers

Replicate et Lambda rappellent quand un job finit. Le motif à suivre existe
déjà, écrit et testé : `lib/billing/webhook.ts`.

Reprends-en l'ordre, il n'est pas arbitraire :
parse → fraîcheur du timestamp → **signature (401, rien n'est écrit)** →
journalisation → résolution du tenant **depuis notre base**, jamais depuis les
metadata du provider → re-vérification côté provider → écriture en une seule
transaction avec une clé d'idempotence.

---

## 6. YouTube

- OAuth : flux d'autorisation, stockage des tokens.
  `lib/crypto/encryption.ts` (AES-256-GCM) existe déjà, la table
  `youtube_tokens` aussi. **Ne logge jamais ces colonnes, ne les expose
  jamais via une route API.**
- Rafraîchissement automatique des tokens expirés.
- Upload résumable du MP4 final.
- **Compteur de quota** : 10 000 unités/jour pour **toute la plateforme**,
  soit environ **6 uploads par jour**, tous tenants confondus. Aucune table
  n'existe pour ça. C'est une contrainte produit dure, pas un détail.
- Programmation des publications : aujourd'hui il n'y a que
  `videos.youtube_video_id` et `videos.published_at`.

---

## 7. Propriétaire du schéma

Quatre devs qui lancent `drizzle-kit` = conflit sur `_journal.json` à chaque
fois. Les autres te **demandent** leurs colonnes, tu produis la migration.

Idéalement : une migration consolidée maintenant pour ce qu'on sait déjà
(publications, quota YouTube), et on n'y retouche plus cette semaine.

---

## 8. CI

Le projet a 236 tests et personne ne les fait tourner automatiquement.
`pnpm test`, `pnpm typecheck`, `pnpm build` sur chaque PR.

C'est ce qui rendra la relecture de Yannick tenable : la machine attrape les
régressions, tu relis la logique.

---

## 9. Relecture du code de Yannick

Budgète **20 à 30 % de ton temps**. Si ce n'est pas budgété explicitement, ça
mange le planning en silence.

Ce que tu cherches en priorité — les erreurs qui **ne se voient pas** à
l'écran : une requête non scopée par tenant, une écriture qui devrait être
dans une transaction, un `any` qui masque un null.
