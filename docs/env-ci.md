# Variables d'environnement — CI et déploiement

Documentation des variables d'environnement critiques pour l'infrastructure, le CI et l'intégration avec les services externes (n8n, YouTube).

**IMPORTANT** : ce document liste les **noms** des variables et leur usage. Les **valeurs** (secrets, tokens, credentials) ne doivent JAMAIS être commitées dans le code. Voir `.env.example` pour la liste complète des variables d'environnement de l'application.

---

## Variables CI (GitHub Actions)

Les tests de la CI nécessitent ces variables minimales :

### `EDGE_TTS_DISABLED`

- **Usage** : Désactive Edge TTS dans les tests pour éviter les appels réseau externes
- **Valeur CI** : `'1'`
- **Requis pour** : CI uniquement (tests)
- **Où définir** : Déjà défini dans `.github/workflows/ci.yml`

### `TEST_DATABASE_URL`

- **Usage** : URL de connexion Postgres pour les tests (non utilisée en CI sans Postgres, mais attendue par certains modules)
- **Valeur CI** : `postgresql://postgres:postgres@localhost:54322/postgres`
- **Requis pour** : CI (tests), développement local
- **Où définir** : `.env` local, déjà défini dans `.github/workflows/ci.yml`

---

## n8n — Orchestration du pipeline de production

n8n orchestre le pipeline de production vidéo. L'application Next.js et n8n communiquent dans les deux sens via des webhooks authentifiés.

### `N8N_BASE_URL`

- **Usage** : URL de base de l'instance n8n que l'application appelle pour démarrer un workflow
- **Exemple** : `https://n8n.votre-domaine.com`
- **Requis pour** : Runtime (production uniquement)
- **Où définir** : Vercel (variables d'environnement de production)
- **Code** : `lib/internal/n8n.ts` — appelle `${N8N_BASE_URL}/webhook/gentube-production`

### `N8N_WEBHOOK_SECRET`

- **Usage** : Secret partagé pour authentifier les appels Next.js → n8n (sens : application démarre le workflow)
- **Génération** : `openssl rand -hex 32`
- **Requis pour** : Runtime (production uniquement)
- **Où définir** : Vercel + configuration du webhook n8n
- **Code** : `lib/internal/n8n.ts` — envoyé en `Authorization: Bearer <secret>`
- **Note** : Utilisé comme fallback pour `INTERNAL_API_TOKEN` si ce dernier n'est pas défini

### `N8N_API_TOKEN`

- **Usage** : Token d'API n8n pour lire/écrire les workflows depuis le serveur MCP (usage agent uniquement, pas l'application)
- **Génération** : n8n → Settings → n8n API → Create an API key
- **Requis pour** : Serveur MCP uniquement (pas pour le runtime de l'app)
- **Où définir** : Configuration du serveur MCP
- **Code** : Non utilisé par l'application Next.js

---

## Routes internes — Authentification n8n → Next.js

### `INTERNAL_API_TOKEN`

- **Usage** : Token Bearer pour authentifier les appels des routes `/api/internal` (sens : n8n appelle l'application)
- **Génération** : `openssl rand -base64 32`
- **Requis pour** : Runtime (production uniquement)
- **Où définir** : Vercel + configuration n8n (en tant que header `Authorization: Bearer <token>`)
- **Code** : `lib/internal/auth.ts` — vérifie l'en-tête `Authorization` des requêtes entrantes
- **Note** : Prioritaire sur `N8N_WEBHOOK_SECRET` ; si absent, l'application se rabat sur `N8N_WEBHOOK_SECRET`
- **Contrat** : Défini dans `docs/contrats.md` §2

**Résumé des deux sens :**
- **Next → n8n** : authentification via `N8N_WEBHOOK_SECRET`
- **n8n → Next** : authentification via `INTERNAL_API_TOKEN` (fallback `N8N_WEBHOOK_SECRET`)

---

## YouTube Data API — OAuth et publication

L'application permet aux utilisateurs de connecter leur chaîne YouTube pour publier des vidéos générées.

### `YOUTUBE_CLIENT_ID`

- **Usage** : Client ID de l'application OAuth Google (YouTube Data API v3)
- **Génération** : Google Cloud Console → API & Services → Credentials
- **Requis pour** : Runtime (OAuth YouTube)
- **Où définir** : Vercel (variables d'environnement)
- **Code** : Non explicitement référencé dans les fichiers scannés, mais attendu par le SDK YouTube

### `YOUTUBE_CLIENT_SECRET`

- **Usage** : Client Secret de l'application OAuth Google
- **Génération** : Google Cloud Console → API & Services → Credentials
- **Requis pour** : Runtime (OAuth YouTube)
- **Où définir** : Vercel (variables d'environnement) — **SENSIBLE, ne jamais exposer côté client**
- **Code** : Non explicitement référencé dans les fichiers scannés, mais attendu par le SDK YouTube

**Redirect URI à enregistrer dans Google Cloud Console :**
```
${BASE_URL}/api/youtube/callback
```

**Quotas YouTube :**
- Depuis juin 2026 : ~100 uploads/jour (bucket dédié)
- Coût par upload : ~100 unités (au lieu de 1600 avant décembre 2025)
- Limite projet-wide, pas par tenant

---

## Checklist de déploiement

Avant de déployer en production :

### Secrets à générer

```bash
# Auth et encryption
openssl rand -hex 32    # → AUTH_SECRET
openssl rand -hex 32    # → ENCRYPTION_KEY

# n8n et routes internes
openssl rand -hex 32    # → N8N_WEBHOOK_SECRET
openssl rand -base64 32 # → INTERNAL_API_TOKEN
```

### Variables à définir dans Vercel

**Obligatoires pour la production complète :**
- `N8N_BASE_URL` — URL de votre instance n8n
- `N8N_WEBHOOK_SECRET` — Secret généré ci-dessus
- `INTERNAL_API_TOKEN` — Secret généré ci-dessus
- `YOUTUBE_CLIENT_ID` — De Google Cloud Console
- `YOUTUBE_CLIENT_SECRET` — De Google Cloud Console

**Obligatoires pour l'application de base :**
- `DATABASE_URL` — Postgres (ex: Vercel Postgres, Supabase)
- `BASE_URL` — URL publique de l'application (ex: `https://gentube.votre-domaine.com`)
- `AUTH_SECRET` — Secret généré ci-dessus
- `ENCRYPTION_KEY` — Secret généré ci-dessus

Voir `.env.example` pour la liste complète incluant R2, DeepSeek, Replicate, ElevenLabs, Polly, etc.

### Configuration n8n

1. Créer un webhook dans n8n : `/webhook/gentube-production`
2. Configurer l'authentification Bearer avec la valeur de `N8N_WEBHOOK_SECRET`
3. Le workflow doit appeler les routes `/api/internal/*` avec `Authorization: Bearer ${INTERNAL_API_TOKEN}`

---

## Notes

- **Ne jamais committer de secrets** : utilisez `.env.example` comme template, mais `.env` est dans `.gitignore`
- **GitHub Secrets** : pour les secrets utilisés en CI (actuellement aucun n'est requis, les tests sont locaux)
- **Vercel Environment Variables** : pour tous les secrets runtime
- **Configuration n8n** : pour les webhooks et l'authentification bidirectionnelle
