# Ezechiel — orchestration, publication et agents

Trois chantiers, et c'est le même : **tout ce qui agit sans qu'un humain
clique.** L'orchestration enchaîne les étapes, la publication est le dernier
nœud de la chaîne, et un agent est une étape qui décide elle-même. Un seul
esprit doit tenir cet ensemble.

## Pourquoi n8n ne se partage pas

n8n n'est pas une étape, c'est **l'ordre des étapes**. Il décide de ce qui
tourne, quand, de ce qui se relance et de ce qui ne doit jamais tourner deux
fois.

Le pipeline porte une règle qu'on ne peut pas violer : la voix mesure la durée
**avant** le débit, le débit a lieu une fois, la voix payée arrive après.
Inverser ces trois-là, c'est facturer un montant que le client n'a pas vu. Celui
qui tient l'orchestration tient cette règle — à deux dessus, l'ordre cesse
d'exister.

C'est aussi la seule voie dont la panne arrête tout. Les autres dégradent une
partie du produit ; une chaîne cassée ne produit rien.

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

## Les deux agents

Ils sont à toi pour la même raison que n8n : un agent qui agit sans validation
humaine, c'est de l'orchestration sous un autre nom.

**L'agent d'accueil.** Il reçoit la personne, retient son style d'écriture et le
genre de vidéos qu'elle fait, lui propose un style et la suit dans le temps. Le
projet porte déjà `projects.style_prompt` et `projects.voice_id` : c'est le
début de cette mémoire, pas sa fin. Ce qu'il faut décider, c'est où vit le reste
et ce qui a le droit d'y écrire.

**L'agent d'analyse.** Il lit les performances d'une vidéo publiée et propose
des corrections de format pour la suivante. Il dépend de deux choses qui
n'existent pas encore, toutes deux chez Prince : les statistiques de
publication, et un journal des événements réels — aujourd'hui `activity_logs`
ne contient que des connexions.

**La règle qui les gouverne, et qui n'est pas négociable.** Un agent ne décide
jamais d'une **destination**. Il propose du contenu ; les clés d'objet, les
identifiants de tenant et les montants sont construits par le code. C'est pour
ça qu'`assetKey()` fabrique les clés au lieu de les recevoir. Cosme audite ce
chemin — préviens-le quand tu ouvres une nouvelle surface d'agent.

**Aucun des deux n'est dans les 48 heures.** Ta coupe hackathon reste la chaîne
complète déclenchée par un calendrier : c'est déjà la colonne vertébrale de la
démonstration.

## Ce qui t'appartient

Tu peux toucher `lib/db/` — mais préviens : le `_journal.json` des migrations
casse dès que deux personnes en génèrent en parallèle. On se coordonne à deux,
pas à six.

À lire d'abord : `docs/passation.md`, section 6 surtout (les pièges trouvés).
