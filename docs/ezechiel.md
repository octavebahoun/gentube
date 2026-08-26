# Ezechiel — n8n et publication YouTube

Deux chantiers, et ils se touchent : la publication est le dernier nœud du
pipeline que tu vas câbler.

## Ce qui existe déjà et que tu orchestres

Six étapes sont codées et testées. Aucune ne s'appelle l'une l'autre : c'est
n8n qui les enchaîne. Leurs verbes, dans l'ordre :

| Étape | Où | Verbe |
|---|---|---|
| Storyboard | `lib/storyboard/service.ts` | `generateStoryboard` |
| Voix — mesure | `lib/storyboard/voiceover.ts` | `generateVoiceover` |
| Validation et débit | `lib/storyboard/service.ts` | `validateStoryboard` |
| Voix — livraison | `lib/storyboard/voiceover.ts` | `finalizeVoiceover` |
| Images | `lib/storyboard/images.ts` | `generateImages` |
| Montage | `lib/render/service.ts` | `startRender` puis `collectRender` |

Les plans animés (Wan sur Replicate) arrivent et se brancheront entre images et
montage.

## L'ordre n'est pas négociable

La voix **mesure** avant le débit, parce que le prix est la somme des durées et
qu'une durée s'obtient en faisant lire la phrase. Le débit a lieu une fois, avec
la clé d'idempotence `video:<id>:debit`. La voix du plan est livrée **après**, et
ne rejoue jamais le calcul du prix.

Inverser ces trois-là, c'est facturer un montant que le client n'a pas vu.

## n8n ne parle jamais à Postgres

Il appelle des routes internes signées. `N8N_WEBHOOK_SECRET` authentifie les
deux sens, `N8N_BASE_URL` est l'instance que l'app appelle pour démarrer un
workflow. Les deux sont déjà documentées dans `.env.example`.

Rien n'est écrit côté routes : c'est ta première tâche. Le reste de l'app
n'utilise presque pas d'API routes — il y en a **cinq** en tout, et tout le
reste passe par des server actions. Ne t'appuie pas sur le nombre de routes
existantes pour deviner la convention : les tiennes sont un cas à part, parce
qu'un appelant externe ne peut pas invoquer une server action.

## Le montage est volontairement en deux temps

`startRender` rend la main tout de suite : Lambda découpe la vidéo en morceaux
rendus en parallèle et ça prend des minutes. **Aucune requête HTTP ne doit
attendre ça.** n8n interroge `collectRender` jusqu'à ce que le job soit
`succeeded` ou `failed`.

Mesuré le 26 août 2026 : 492 images, 52 invocations Lambda, 12,7 s de mur pour
16,4 s de vidéo. Le premier bout-en-bout complet a pris 34 s, R2 comprise.

Un rendu relancé ne redémarre pas une seconde exécution : le job existant est
renvoyé tel quel. Ne construis pas de garde-fou par-dessus, il est déjà là.

## YouTube : rien n'est branché

La table `youtube_tokens` existe, les jetons y sont chiffrés avec
`ENCRYPTION_KEY` — la faire tourner rend **tous** les jetons indéchiffrables et
force chaque tenant à reconnecter sa chaîne. La table `youtube_quota_usage`
existe aussi. Il n'y a **aucune** route OAuth : à écrire, sur
`${BASE_URL}/api/youtube/callback`.

Le piège est le quota. Un envoi coûte **1 600 unités** sur un quota de **10 000
par jour pour tout le projet** — pas par tenant. Six envois par jour pour la
plateforme entière. Demande l'augmentation avant d'avoir des clients, pas après.

## Ce qui t'appartient

Tu peux toucher `lib/db/` — mais préviens : le `_journal.json` des migrations
casse dès que deux personnes en génèrent en parallèle. On se coordonne à deux,
pas à six.

À lire d'abord : `docs/passation.md`, section 6 surtout (les pièges trouvés).
