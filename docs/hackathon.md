# Hackathon Cursor — 2 jours, 5 personnes

Du **9 au 10 septembre 2026**. L'objectif n'est pas d'ajouter des
fonctionnalités : c'est qu'un client aille **du prompt au MP4 sans qu'on touche
un bouton à sa place**.

Ce document a été refait le 8 septembre après **vérification dans le code**. La
première version reprenait la section « Ce qui manque » du README, qui a
vieilli : elle faisait redéployer Vercel et Lambda, et redessiner un écran de
réglages qui existe déjà. Ce qui suit a été lu fichier par fichier.

---

## Ce qui est déjà en place — à ne pas refaire

| Ce qu'on croyait à faire | La réalité |
|---|---|
| Déployer sur Vercel | Le projet est lié : `.vercel/project.json`, `prj_nInyQ836…` |
| Déployer le montage sur Lambda | Fait et mesuré. `HYPERFRAMES_STATE_MACHINE_ARN` et le bucket sont posés ; 16,4 s de vidéo montée en 34 s pour 0,0105 $ |
| L'écran de réglages de rendu | `components/storyboard/video-settings.tsx`, branché dans `videos/[id]` : qualité, cadrage 16:9 / 9:16, style de sous-titres, musique |
| Un sélecteur de musique | Dans le même écran, alimenté par le catalogue — 51 sons sur R2 depuis le 2 septembre |
| Brancher le choix de voix | Déjà branché : `lib/storyboard/voiceover.ts` lit `video.voice ?? project.voiceId`. Seul le texte d'aide du formulaire de projet dit encore le contraire — **une ligne à corriger, pas un chantier** |
| L'écran de suivi de fabrication | `/dashboard/fabrication` existe et `etapes.ts` calcule l'état de chaque poste |
| Récupérer le MP4 fini | Visible et signé depuis `videos/[id]` |

Les clés fournisseurs sont toutes posées : R2, DeepSeek, Replicate, Novita,
ElevenLabs, Cloudflare AI, SasPay, AWS.

## Ce qui manque vraiment

Dix points. Les huit premiers ont été vérifiés dans le dépôt le 8 septembre
2026 ; les deux derniers sont des demandes produit du 9 septembre, sur
lesquelles l'accent a été mis.

| # | Ce qui manque | Comment c'est vérifié |
|---|---|---|
| 1 | Les routes `/api/internal/*` | `app/api/` ne contient que `billing`, `tenant`, `user` et `webhooks` |
| 2 | Le workflow n8n | `N8N_BASE_URL` et `N8N_WEBHOOK_SECRET` sont **vides**, et aucun fichier `.ts` ne mentionne n8n |
| 3 | La publication YouTube | `YOUTUBE_CLIENT_ID` et `YOUTUBE_CLIENT_SECRET` sont **vides** ; les tables `publications`, `youtube_tokens`, `youtube_quota_usage` existent et aucune ligne de code ne les touche |
| 4 | Le journal des événements réels | `logActivity()` vit dans `app/(login)/actions.ts` et n'est appelé que sur `SIGN_IN` et `CREATE_TENANT` |
| 5 | L'administration | Aucune route, aucun écran : `app/` ne contient que `(dashboard)` et `(login)` |
| 6 | La résiliation | `subscriptions.cancel_at` existe en base, **zéro occurrence** dans le code |
| 7 | La CI, donc SAST et DAST | Il n'y a pas de dossier `.github` |
| 8 | Le rafraîchissement de la régie | `fabrication/page.tsx` n'a ni `useSWR` ni `revalidate` : l'écran est juste, mais figé |
| 9 | Le suivi YouTube | `publications` porte l'envoi et son quota, **aucune colonne de statistiques** : ni vues, ni durée regardée. Il faut une table de plus |
| 10 | L'agent IA en tool calling | Rien. `lib/llm/` écrit des storyboards ; il n'y a aucun agent qui appelle des outils |

---

## L'équipe

| Qui | Sa voie |
|---|---|
| Ezechiel | Les routes `/api/internal` et le workflow n8n, puis l'isolation et la résiliation |
| Prince | Le journal des événements, puis toute la voie YouTube — l'envoi et le suivi |
| Ahmad | Le direct sur la régie, puis les écrans d'administration |
| Merveille | L'agent IA en tool calling, et l'API d'administration |
| Cosme | L'hébergement n8n, les quatre variables vides, la CI et SAST/DAST |

**Rien n'est coupé.** Les dix points sont attribués. En échange, deux voies
sortent de ce qu'on tient d'habitude en deux jours : celle de Merveille, parce
que l'agent est un chantier à lui seul, et celle de Prince, qui prend YouTube
en entier.

## Les règles qui évitent les collisions

**Une seule personne génère des migrations : Merveille.** Le `_journal.json` de
Drizzle casse dès que deux `db:generate` se croisent. Les tables nécessaires
existent déjà — personne ne devrait avoir à migrer.

**Les écrans sont découpés par zone.** Ahmad et Prince ne doivent jamais ouvrir
le même fichier en même temps.

**Le moteur de montage ne bouge pas.** `lib/render/` et `lib/storyboard/`
restent fermés : personne des cinq n'y est affecté.

---

## Ezechiel — l'orchestration

Le chantier critique. Tant qu'il n'existe pas, aucun autre travail ne se voit.

Les treize actions de `app/(dashboard)/dashboard/videos/actions.ts` exécutent
déjà chaque étape et appellent `lib/storyboard/`, `lib/voice/`, `lib/images/`,
`lib/render/`. **Le métier est écrit et testé ; il n'est pas appelable de
l'extérieur.**

### Jour 1

1. Le socle d'authentification de `docs/contrats.md` §2 : en-tête
   `Authorization: Bearer <INTERNAL_API_TOKEN>`, `tenantId` pris dans le corps
   **et vérifié contre la ressource visée**.

   Attention au nom : le contrat dit `INTERNAL_API_TOKEN`, le `.env` porte
   `N8N_WEBHOOK_SECRET`. Trancher avec Cosme à la première heure, une bonne
   fois.
2. Une route par étape — voix, images, clips, rendu, statut — chacune
   enveloppant la fonction métier existante. Pas de logique nouvelle : on
   déplace l'appel.
3. Chaque route écrit dans `jobs` : `step`, `external_id`, `status`,
   `attempts`. La table existe, avec un index unique sur `external_id` pour
   qu'un webhook rejoué ne résolve qu'un seul job.
4. Le workflow n8n qui enchaîne voix → images → clips → rendu, avec ses
   attentes et sa politique de reprise.

**Livrable de fin de J1 : une vidéo validée sort en MP4 sans aucun clic.**

### Jour 2 — l'isolation et la résiliation

Deux points repris à Merveille, pour qu'elle tienne l'agent IA.

- **L'isolation des routes internes.** `tenantDb()` ne protège rien si
  `/api/internal` accepte un `tenantId` sans le confronter à la ressource. Ce
  sont ses propres routes : personne n'est mieux placé.
- **La résiliation.** `subscriptions.cancel_at` existe en base et n'apparaît
  nulle part dans le code. Un client ne peut pas partir seul.

---

## Prince — le journal, puis YouTube

### Jour 1 — le journal des événements réels

`activity_logs` ne contient que des connexions. Sortir `logActivity()` vers
`lib/activity/` et l'appeler sur ce qui compte : vidéo créée, storyboard
généré, vidéo validée, crédits débités, rendu lancé, rendu terminé, paiement
reçu.

**Deux chantiers sont bloqués derrière** : l'administration n'a rien à
afficher, la sécurité rien à auditer. Une demi-journée qui en débloque deux.

### Jour 2 — YouTube en entier

L'envoi **et** le suivi. Ce sont deux API différentes chez Google, mais une
seule voie chez nous : les séparer entre deux personnes ferait écrire la table
`publications` à quatre mains.

- **L'envoi.** Route OAuth, publication, décompte du quota. Cosme doit avoir
  rempli `YOUTUBE_CLIENT_ID` et `YOUTUBE_CLIENT_SECRET`.
- **Le suivi.** `publications` porte l'envoi et son coût en quota, pas les
  chiffres d'audience. Il faut une table de statistiques — vues, durée
  regardée, relevé daté — et **c'est la seule migration du hackathon**. Elle
  passe par Merveille, seule à lancer `db:generate`. La lui demander au jour 1,
  pas au jour 2.

Le quota compte : ~100 unités par envoi et ~100 appels par jour pour toute la
plateforme, remis à zéro à minuit Pacifique — 9 h du matin à Cotonou.

---

## Ahmad — le direct, puis l'administration

L'écran de réglages de rendu existe déjà et le redesign du 6 septembre a refait
tout le dashboard. Le J1 est donc plus court que prévu.

### Jour 1

- **La régie en direct.** `/dashboard/fabrication` affiche l'état juste mais
  figé : ni `useSWR`, ni `revalidate`. Le brancher sur les jobs qu'Ezechiel
  écrit, et laisser SWR rafraîchir. Le client doit voir sa vidéo avancer.
- **La ligne qui ment.** Le formulaire de projet annonce que le choix de voix
  « servira quand le choix de voix sera branché » — il l'est. Corriger le texte
  et proposer la liste des voix plutôt qu'un champ libre.

### Jour 2

- **L'écran de conversation de l'agent.** Merveille écrit la boucle et les
  outils ; il faut une surface pour lui parler, voir les outils qu'il appelle,
  et reprendre la main. Sans elle l'agent n'est démontrable que dans un
  terminal.
- Les écrans d'administration, sur l'API que Merveille livre.
- L'écran de publication et ses statistiques, si Prince tient son jour 2.

---

## Merveille — l'agent IA, et l'API d'administration

C'est la voie la plus lourde des cinq. L'isolation et la résiliation lui ont
été retirées pour ça.

### L'agent IA en tool calling — les deux jours

Un agent qui discute et **refait tout ce qu'un humain fait dans l'application** :
créer un projet, écrire un storyboard, corriger une scène, lancer la voix, les
images, le montage, publier.

Trois choses à tenir, dans cet ordre :

1. **Les outils sont les routes d'Ezechiel.** L'agent n'appelle pas
   `lib/storyboard/` en direct : il appelle `/api/internal`, comme n8n. Sinon on
   écrit deux fois la même chose, et l'isolation par tenant fuit par le second
   chemin. **Il dépend donc du jour 1 d'Ezechiel** — commencer par la boucle et
   les définitions d'outils, brancher quand les routes existent.
2. **Le modèle est DeepSeek**, comme le reste. API compatible OpenAI, donc le
   `tool_calling` est celui qu'on connaît. Attention au piège déjà rencontré :
   ce sont des modèles à raisonnement, un budget serré renvoie un HTTP 200 avec
   un contenu **vide** — garder `DEEPSEEK_MAX_TOKENS` large.
3. **Un outil ne contourne jamais une règle métier.** Le débit, la validation
   du storyboard, le refus de modifier une vidéo qui n'est plus en `draft` :
   l'agent passe par les mêmes fonctions, ou il devient un trou.

Une conversation qui crée un projet, écrit un storyboard et lance un rendu
suffit à démontrer. Le reste des outils s'ajoute ensuite, un par un.

### L'API d'administration — jour 1

Nombre de vidéos, erreurs, quotas consommés par tenant. Rien n'existe. Ahmad la
dessine au jour 2, elle doit exister avant.

### Et les migrations

Elle reste la seule à lancer `db:generate`. Une seule est attendue : la table
de statistiques que Prince demandera au jour 1.

---

## Cosme — infra et sécurité

Vercel et Lambda sont déjà déployés. Ce qui reste n'est pas du déploiement,
c'est ce qui n'a jamais été posé.

### Jour 1

- **Un n8n hébergé et joignable**, puis `N8N_BASE_URL` et `N8N_WEBHOOK_SECRET`
  remplis. Ils sont vides : Ezechiel est bloqué tant qu'ils le restent, donc
  c'est la première heure du jour 1, pas la dernière.
- **`YOUTUBE_CLIENT_ID` et `YOUTUBE_CLIENT_SECRET`**, vides aussi. Créer le
  projet Google Cloud et l'écran de consentement prend du temps calendaire :
  à lancer J1 même si la publication est J2.
- Trancher avec Ezechiel le nom du jeton des routes internes.

### Jour 2

- La CI : il n'y a pas de `.github`. Donc pas de SAST, pas de DAST, et pas de
  `pnpm test` au push non plus — la suite de 392 tests ne tourne que sur les
  postes.
- Le rodage de la démo : tout sur l'URL publique, pas sur un `localhost`.

---

## Où en est le moteur de montage

Il n'est au programme de personne, mais **il n'est pas fini** — il est seulement
assez mûr pour qu'une démo n'en dépende pas.

Relevé du 4 septembre 2026, **à la mesure et non aux coches** : chaque entrée du
palier 2 a été composée avec le champ rempli puis sans, et les deux pages
comparées octet par octet.

**104 entrées restent sur 373.** 214 rendues, 10 partielles, 15 disponibles
autrement, 30 refusées avec leur raison.

| Palier | Reste | Sur |
|---|---|---|
| 1 | 2 | 105 |
| 2 | 19 | 165 |
| 3 | 83 | 103 |

Les 83 du palier 3 ne sont pas 83 chantiers de code : l'essentiel demande une
décision produit — les cartes géographiques, les maquettes d'interface, les
quatorze `code-snippet-*`, les terminaux.

Détail entrée par entrée dans `passation/recap-palier-3.md` §6.

---

## Ce qu'on ne fait pas ces deux jours

- Les notifications — le canal est encore un choix produit.
- Le second agent : celui qui lit les performances et propose des
  corrections. Le premier — l'assistant en tool calling — est au programme.
- L'élargissement du vocabulaire de rendu.
- Le coût réel par job, enregistré à la génération.
- Les sept fonctionnalités du backlog produit — avatar parlant, clonage de
  voix, générateur de musique.

---

## Le seul indicateur qui compte

À la fin du jour 1, un compte neuf crée une vidéo, la valide, et récupère son
MP4 **sans qu'un développeur ne lance quoi que ce soit**.

Si ça marche, le jour 2 est du confort. Si ça ne marche pas, le jour 2 sert à ça
et à rien d'autre.
