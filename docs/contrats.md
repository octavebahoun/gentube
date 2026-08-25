# Les quatre contrats

Écrits le 25 août 2026. Sans eux, quatre développeurs improvisent la même
chose différemment et on s'en aperçoit à l'intégration.

Chacun tranche une question qui traverse plusieurs couloirs. Ce ne sont pas
des suggestions : si l'un vous gêne, on en discute et on le change ici, on ne
le contourne pas dans son coin.

---

## 1. Les jobs

### Le vocabulaire de `step`

Cinq valeurs, pas une de plus :

| `step` | Ce qu'il produit |
|---|---|
| `voiceover` | Le MP3 d'une scène et ses timings mot à mot |
| `image` | L'image fixe d'une scène |
| `clip` | Le clip animé d'une scène |
| `render` | Le MP4 final de la vidéo |
| `publish` | La mise en ligne YouTube |

Un job porte **une scène** pour `voiceover`, `image` et `clip` ; **une vidéo**
pour `render` et `publish`. La scène concernée vit dans `payload`, pas dans une
colonne : les trois premiers types en ont une, les deux derniers non.

### Où vit la vérité

**`jobs` est la source de vérité. `videos.status` en est une projection.**

C'est la seule règle qui compte ici. Sans elle, les deux divergent et personne
ne sait laquelle croire quand un client appelle.

Concrètement :

- Le détail de l'avancement se lit **toujours** dans `jobs`.
- `videos.status` est mis à jour **dans la même transaction** que le job qui
  le fait changer. Jamais par un autre chemin, jamais par un cron de
  rattrapage.
- Un seul écrivain : l'orchestrateur. Une route d'API qui voudrait « corriger »
  un statut est un bug, pas un raccourci.

### La politique de reprise

- **3 tentatives**, comptées dans `jobs.attempts`.
- Attentes : 30 s, 2 min, 10 min. Un provider saturé se remet rarement en
  moins de trente secondes.
- Après la troisième : le job passe `failed`, la vidéo passe `failed`, et
  **les crédits sont remboursés** (`refundVideo`).
- Une reprise ne repaie jamais ce qui est déjà fait. `generateVoiceover()`
  montre le motif : une scène déjà mesurée est sautée.

### L'idempotence

`jobs.external_id` est **unique**. Un webhook rejoué par Replicate ou Lambda
résout donc exactement un job, ou aucun. Ne jamais résoudre un job depuis les
metadata du provider : elles sont sous son contrôle, pas sous le nôtre.

---

## 2. n8n ↔ Next.js

### Qui commande

**n8n orchestre la séquence. L'application exécute chaque étape.**

n8n enchaîne : voix off → images → clips → rendu → publication. Il décide de
l'ordre, des attentes et des reprises.

Mais **il n'appelle jamais Replicate, Workers AI, Polly ou ElevenLabs
directement.** Il appelle notre API, qui appelle le provider.

### Pourquoi ce sens-là

Trois raisons, dans l'ordre d'importance :

1. **Les clés restent à un seul endroit.** Les mettre aussi dans n8n, c'est
   deux inventaires à tenir et deux endroits à révoquer le jour où l'une fuit.
2. **Le comptage des coûts passe par nous.** Si n8n appelle le provider en
   direct, on ne sait plus ce qu'une vidéo a réellement coûté.
3. **L'isolation par tenant est dans notre code.** `tenantDb()` ne protège
   rien si l'écriture vient d'ailleurs.

### L'authentification

Les routes d'orchestration vivent sous `/api/internal/*` et exigent un en-tête
`Authorization: Bearer <INTERNAL_API_TOKEN>`.

- Le jeton est une variable d'environnement, jamais en base.
- Ces routes ne sont **jamais** appelées depuis un navigateur : pas de CORS,
  pas de session, pas de cookie.
- Elles prennent le `tenantId` dans leur corps de requête et le vérifient
  contre la ressource visée. Un jeton valide ne donne pas accès à tout.

---

## 3. Le plan de nommage R2

`assetKey(tenantId, ...parts)` impose le préfixe tenant et refuse les segments
de traversée. Voici ce qu'on met derrière.

```
<tenant>/videos/<videoId>/voice/scene-<n>.mp3
<tenant>/videos/<videoId>/images/scene-<n>.png
<tenant>/videos/<videoId>/clips/scene-<n>.mp4
<tenant>/videos/<videoId>/render/final.mp4
<tenant>/videos/<videoId>/render/thumbnail.jpg
<tenant>/videos/<videoId>/studio/            ← espace de travail Studio
```

`<n>` est l'**ordre** de la scène, pas son id de ligne. Une scène déplacée
garde son fichier ; c'est le storyboard qui dit quel fichier va où.

### L'exception : la bibliothèque de sons

```
sounds/sfx/<clé>.mp3
sounds/ambient/<clé>.mp3
sounds/music/<clé>.mp3
```

**Sans préfixe tenant**, parce que le catalogue appartient à la plateforme et
non à un client. C'est le jumeau, côté stockage, de la table `sound_assets`
qui est la seule table hors `tenants` que `tenantDb()` ne scope pas.

Conséquence : `keyBelongsToTenant()` renvoie `false` sur ces clés, et c'est
normal. Elles se signent sans contrôle d'appartenance, comme une police de
caractères.

Écriture réservée à l'import d'administration. Aucun chemin utilisateur
n'écrit sous `sounds/`.

### Règles générales

- Une clé est **définitive**. On ne renomme pas, on n'écrase pas : un nouveau
  contenu prend une nouvelle clé. Une URL signée en vol reste valide.
- Rien n'est public. Tout se lit par `signedUrl()`, quinze minutes.
- La clé stockée en base est la clé applicative, jamais une URL.

---

## 4. La publication

### Ce qui manque aujourd'hui

`videos.youtube_video_id` et `videos.published_at`, et rien d'autre. Pas de
programmation, pas d'historique, pas de compteur de quota.

### La table `publications`

Une ligne par tentative de publication, pas une par vidéo — une republication
après échec doit rester lisible.

| Colonne | Rôle |
|---|---|
| `tenant_id`, `video_id` | À qui, quoi |
| `provider` | `youtube` aujourd'hui, autre chose demain |
| `external_id` | L'id YouTube, une fois obtenu |
| `status` | `scheduled` · `uploading` · `published` · `failed` |
| `scheduled_for` | Quand publier. `null` = tout de suite |
| `published_at`, `error` | Le verdict |
| `quota_units` | Ce que l'appel a coûté en quota |

`videos.youtube_video_id` reste, en projection de la dernière publication
réussie — même règle que `videos.status` face à `jobs`.

### Le quota YouTube

**10 000 unités par jour pour toute la plateforme**, tous clients confondus.
Un envoi coûte 1 600 unités, donc environ **six publications par jour**.

Ce n'est pas une limite par client : c'est une limite sur nous. Deux clients
qui publient trois vidéos chacun l'épuisent.

Table `youtube_quota_usage` : une ligne par jour (`date` unique,
`units_used`). Le compteur est incrémenté **dans la transaction qui crée la
publication**, pas après l'envoi — sinon deux envois simultanés passent tous
les deux.

Quand le quota est épuisé, une publication est **reportée**, pas refusée :
`status: 'scheduled'`, `scheduled_for` au lendemain. Un client qui a payé sa
vidéo ne doit pas la perdre parce qu'un autre a publié avant lui.

Le quota se réinitialise à minuit **Pacifique** (heure de Google), pas à
minuit chez nous. À Cotonou, c'est 9 h du matin en heure d'hiver.
