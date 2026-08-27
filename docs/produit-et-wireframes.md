# GenTube — description du produit et prompts de wireframes

> **Révisé le 25 août 2026.** Trois changements sont désormais intégrés :
>
> 1. **Le rendu passe par Hyperframes** (HeyGen, Apache 2.0, HTML → MP4) —
>    les mentions Remotion ont été remplacées.
> 2. **Hyperframes Studio est embarqué** — voir §2.9 ter ; les écrans de
>    storyboard portent l'onglet « Studio ».
> 3. **Les tarifs sont alignés sur `docs/tarifs.md`** : 720p à 3 crédits/s,
>    recharge 5 000 FCFA = 360 crédits, voix Amazon Polly par défaut
>    (ElevenLabs réservé Pro/Business), offre fondateurs — les 15 premiers
>    clients gardent leur tarif pendant 1 an.

Document de travail pour concevoir les interfaces. La partie 1 décrit le produit
tel qu'il est **réellement implémenté** (le code fait autorité, pas les specs
d'origine, et les divergences sont signalées). La partie 2 donne des prompts
prêts à coller dans un générateur d'interface.

Dernière mise à jour : 25 août 2026 — état du dépôt : J1–J5 + J12 livrés,
plus la voix off et le contrat de rendu. 236 tests verts.

**Wireframes finaux** (thème sombre, accent rouge YouTube) :
`docs/wireframes/index.html`. Ce sont eux que le frontend implémente ; la
partie 2 ci-dessous reste la référence pour les états et les libellés.

---

# Partie 1 — Le produit

## 1.1 En une page

GenTube est un SaaS multi-tenant qui produit des vidéos YouTube générées par IA,
de bout en bout, pour un marché francophone d'Afrique de l'Ouest.

Un utilisateur crée un **projet** (un style visuel, une voix, une chaîne
YouTube, un pipeline par défaut). Dans ce projet, il lance une **vidéo** à partir
d'un thème en une phrase. Un LLM en écrit le **storyboard** : une liste de
scènes, chacune avec la **narration** que la voix lira, un prompt visuel en
anglais, un type (image fixe ou clip animé) et son habillage sonore.
L'utilisateur réécrit ce qu'il veut, réordonne, supprime, ajoute. La voix off est
enregistrée — c'est elle qui donne la durée réelle de chaque scène, donc le prix
exact. Quand il **valide**, les crédits sont débités et le pipeline produit les
visuels, assemble, et publie sur sa chaîne.

Ce qui distingue le produit de ses équivalents occidentaux n'est pas la
technologie de génération, c'est **la caisse et la monnaie** : prix en FCFA,
paiement par mobile money, pas de carte bancaire exigée, pas de facturation en
dollars.

## 1.2 À qui il s'adresse

- Créateurs de chaînes YouTube francophones qui publient à cadence régulière et
  n'ont ni équipe de montage ni budget en devises.
- Agences et community managers locaux qui produisent pour plusieurs clients —
  d'où le multi-tenant avec plusieurs projets et plusieurs chaînes.
- Le cas normal, pas l'exception : **un créateur gère plusieurs chaînes**.

Conséquence de conception : tout est pensé pour un usage au téléphone autant
qu'au bureau. Le paiement se fait au téléphone (mobile money), donc l'écran de
facturation et l'écran de validation doivent être utilisables sur mobile.

## 1.3 Modèle économique

**Unité de crédit** : 1 crédit = 1 seconde de vidéo générée en 480p.
En 720p, **3 crédits par seconde** (révision du 25 août 2026, calée sur le
coût réel : 2,1× le 480p).

> ⚠️ Les specs d'origine annonçaient 2 crédits/s en 720p ; le code est resté
> longtemps à 4. Révisé au 25 août 2026 : **3 crédits/s** — voir `docs/tarifs.md`.

| Plan | Prix / mois | Crédits | ≈ en 480p |
|---|---|---|---|
| Starter | 15 000 FCFA | 1 320 | ~22 min |
| Pro | 30 000 FCFA | 2 700 | ~45 min |
| Business | sur devis | négocié | — |

**Recharge ponctuelle** : 5 000 FCFA = 360 crédits (≈ 6 min). Les crédits
achetés n'expirent pas.

> ⚠️ Deux points de tarification non tranchés, à afficher clairement à l'équipe
> plutôt qu'à cacher dans l'interface :
> - La colonne « Crédits » des specs (10 000 / 22 000) est incohérente avec
>   l'unité définie dans la même section. Les valeurs retenues (1 320 / 2 700)
>   sont celles qui correspondent aux minutes annoncées.
> - Le pack de recharge à 3 000 crédits était **vendu à perte** ; révisé le
>   25 août à 360 crédits (≈ 6 min, marge ~52 %).

**Ce que le client paie et ce qu'il consomme sont deux choses distinctes.** Il
achète des FCFA de crédits ; il consomme des secondes de vidéo. L'interface doit
constamment traduire l'un dans l'autre — c'est la traduction que l'utilisateur
n'a pas envie de faire de tête.

**Paiement** : GeniusPay, mobile money et carte, en XOF. Commission passerelle
de 1,5 %. Le compte marchand est plafonné à **500 000 FCFA encaissés par mois**,
soit ~16 clients Pro : plafond à faire relever avant l'ouverture des
inscriptions.

## 1.4 Rôles et isolation

Trois rôles par workspace : `owner`, `admin`, `member`.

| Action | owner | admin | member |
|---|---|---|---|
| Créer / configurer un projet | ✅ | ✅ | ✅ |
| Supprimer un projet | ✅ | ✅ | ❌ |
| Créer une vidéo, éditer un storyboard | ✅ | ✅ | ✅ |
| Valider (débiter des crédits) | ✅ | ✅ | ✅ |
| Payer un abonnement, recharger | ✅ | ✅ | ❌ |
| Inviter / retirer un membre | ✅ | ✅ | ❌ |

Règle d'isolation : une ressource appartenant à un autre tenant répond
**« introuvable »**, jamais « interdit ». L'interface ne doit donc jamais
afficher un message du type « vous n'avez pas accès à ce projet » — un id
inconnu et un id appartenant à quelqu'un d'autre donnent la même page 404.

## 1.5 Parcours complet

```
1.  Inscription           → un workspace est créé, l'utilisateur en est owner
2.  Abonnement            → mobile money, les crédits du cycle sont accordés
3.  Projet                → style visuel, voix, chaîne YouTube, pipeline défaut
4.  Vidéo                 → titre + thème + résolution + pipeline
5.  Storyboard généré     → le LLM écrit la NARRATION de chaque scène,
                             son prompt visuel, ses effets, ses bruitages
6.  Édition               → réécrire la narration et le visuel, réordonner
7.  VOIX OFF              → la voix lit chaque scène. Sa longueur RÉELLE
                             devient la durée de la scène, donc le prix exact
8.  VALIDATION            → les crédits sont débités ici, et nulle part ailleurs
9.  Génération            → clips (Replicate) et images (Flux), en parallèle
10. Assemblage            → Hyperframes sur Lambda, MP4 final sur R2
11. Publication           → YouTube, immédiate ou programmée
12. Statistiques          → vues, likes, watch time, historique daté
```

**L'ordre des étapes 7 et 8 est la décision structurante du produit.** La durée
d'une scène n'est pas un nombre qu'on choisit : c'est la longueur de l'audio.
Tant que la voix off n'existe pas, le prix affiché n'est qu'une estimation lue
sur le texte (~14 caractères par seconde). La voix off coûte des centimes là où
un clip vidéo coûte des dizaines de centimes : on la fait passer avant le
paiement, et en échange le montant sur le bouton est le montant débité.

L'écran de validation est donc le seul endroit du produit où l'utilisateur doit
voir, sans ambiguïté : ce qu'il va obtenir, ce que ça coûte **exactement**, et
ce qu'il lui restera.

## 1.6 États d'une vidéo

```
draft → validated → generating → rendering → rendered → published
                                     ↘ failed
```

- `draft` — **le seul état modifiable**. Storyboard éditable, vidéo supprimable.
- `validated` — crédits débités, en attente de prise en charge.
- `generating` / `rendering` — le pipeline tourne, l'écran doit montrer une
  progression plan par plan.
- `rendered` — MP4 prêt, pas encore publié.
- `published` — en ligne, avec ses statistiques.
- `failed` — le pipeline a cassé ; les crédits consommés sont remboursés.

Une fois sorti de `draft`, le storyboard devient un **historique en lecture
seule**, pas un formulaire grisé. La nuance compte pour le dessin : on ne montre
pas des champs désactivés, on montre un état de fait.

## 1.7 Architecture

```
Next.js 15 (App Router) — dashboard, auth, API, code Hyperframes
   │
   ├── PostgreSQL + Drizzle — 16 tables, isolation par tenantDb()
   ├── DeepSeek — script et storyboard (modèle à raisonnement)
   ├── GeniusPay — abonnements et recharges, XOF
   │
   └── n8n (VPS) — orchestrateur asynchrone
          ├── Replicate wan-2.2-*-fast — clips vidéo
          ├── Cloudflare Workers AI (Flux) — images
          ├── Amazon Polly — voix off (ElevenLabs en Pro)
          ├── AWS Lambda + Hyperframes — assemblage
          └── YouTube Data API — publication + statistiques
                    │
              Cloudflare R2 — tous les assets, préfixe tenant_id/
```

Règles qui ont un effet visible à l'écran :

- **Next.js ne fait jamais d'appel long.** Il crée un job et rend la main. Donc
  aucune interface ne doit attendre : tout ce qui prend plus d'une seconde
  s'affiche comme un état en cours, jamais comme un spinner bloquant.
- **Les crédits ne bougent qu'à la validation**, et le débit est atomique : il
  bloque à zéro plutôt que de passer en négatif.
- **Un webhook seul ne crédite jamais.** Après paiement, le solde peut mettre
  quelques secondes à apparaître — l'interface doit le dire au lieu d'afficher un
  solde faux.

## 1.8 Modèle de données (16 tables)

| Domaine | Tables |
|---|---|
| Tenancy | `tenants`, `users`, `invitations`, `activity_logs` |
| Production | `projects`, `videos`, `shots`, `jobs` |
| Crédits | `credit_ledger` |
| Facturation | `subscriptions`, `billing_cycles`, `payment_intents`, `payment_attempts`, `payment_webhook_events` |
| Publication | `youtube_tokens` |
| Sons partagés | `sound_assets` |

Une scène (`shots`) porte **deux textes** :

- `narration` — ce que la voix lit, dans la langue de la vidéo ;
- `prompt` — le visuel, en anglais (les modèles d'image sont entraînés dessus).

Plus : `type` (image/video), `duration_s` (fractionnaire : 5,28 s),
`duration_source` (`estimated` ou `measured`), `audio_url` (la voix off),
`words` (timings mot-à-mot pour le karaoké), `asset_url`, statut, et une
colonne `render` en jsonb pour l'habillage — zoom, transition, mouvement de
caméra, texte incrusté, titre animé, bruitages, volumes.

La vidéo porte les réglages globaux : `ratio` (16:9 ou 9:16), voix, sous-titres
et leur style (karaoke / fondant / cinematic), musique de fond et volumes.

`sound_assets` est la bibliothèque partagée de bruitages, ambiances et musiques,
avec leurs pics d'impact en secondes. C'est la seule table, avec `tenants`, qui
n'appartient à aucun client.

## 1.9 État d'avancement

| Livré et testé | Reste à faire |
|---|---|
| Auth, workspace, membres, rôles | Génération des plans (Replicate, Flux) |
| Isolation multi-tenant | Assemblage final (Hyperframes + Lambda) |
| Crédits : ledger, débit, blocage à zéro | Publication YouTube + OAuth |
| Projets : CRUD + configuration | Statistiques YouTube |
| Vidéos + storyboard IA + édition | Statistiques |
| Voix off Polly/ElevenLabs, durées mesurées | Orchestration n8n |
| Bibliothèque de sons partagée | Composition Hyperframes à recopier |
| Contrat de rendu Hyperframes porté | **Stockage R2 — bloque tout le reste** |
| Validation refusée sur une estimation | Glisser-déposer du kanban |
| Facturation GeniusPay complète | |

Écrans qui existent aujourd'hui : `/dashboard`, `/dashboard/projects`,
`/dashboard/projects/new`, `/dashboard/projects/[id]`,
`/dashboard/projects/[id]/videos/new`, `/dashboard/videos/[id]`,
`/dashboard/billing`, plus les réglages hérités du template (général, activité,
sécurité).

Écrans à concevoir mais pas encore construits : progression du pipeline,
connexion de chaîne YouTube, publication, statistiques, page d'accueil publique.

## 1.10 Contraintes structurelles à connaître avant de dessiner

1. **Quota YouTube** : ~100 publications par jour pour tous les tenants
   confondus. Les envois ont leur propre quota depuis juin 2026, et un envoi
   coûte ~100 unités depuis décembre 2025 au lieu de 1 600. L'interface doit
   quand même pouvoir dire « la file est pleine, ta vidéo part demain » sans que
   ça ressemble à une panne : la limite est globale, pas par client.
2. **Plafond GeniusPay** : 500 000 FCFA/mois encaissés.
3. **Temps de génération** : ~30–40 s par clip en 480p, ~150 s en 720p. Une
   vidéo de 2 min en 480p ≈ 15 clips ≈ 10 min en séquentiel, quelques minutes
   en parallèle. L'attente est réelle : elle doit être occupée, pas masquée.
4. **Le LLM raisonne avant de répondre.** Une génération de storyboard prend
   plusieurs secondes et peut échouer proprement. Prévoir l'état « en train
   d'écrire » et l'état « le modèle a renvoyé quelque chose d'inutilisable,
   réessaie » — dans ce cas l'ancien storyboard est intact.

---

# Partie 2 — Prompts de wireframes

## 2.1 Comment utiliser ces prompts

Chaque prompt est autonome et se colle tel quel dans un générateur d'interface
(v0, Claude, Figma Make, Lovable…). Ils supposent tous le **contexte commun**
ci-dessous : colle-le une fois en tête de conversation, puis enchaîne les
prompts d'écran.

Pour un générateur d'images (Midjourney, DALL·E), voir la variante en 2.14 —
la formulation change complètement.

## 2.2 Contexte commun (à coller en premier)

```
Tu conçois les wireframes d'un SaaS web appelé GenTube : une plateforme
multi-tenant de génération de vidéos YouTube par IA, destinée à des créateurs
francophones d'Afrique de l'Ouest. Les prix sont en FCFA (XOF), le paiement se
fait par mobile money.

Système de design, à respecter sur tous les écrans :
- Stack : Next.js App Router, Tailwind CSS, composants shadcn/ui.
- Thème sombre cinématique. Fond noir profond (#000000), cartes gris anthracite
  (#1C1C1E) bordées (#2A2A2D), texte blanc, secondaire #A5A5AA, tertiaire
  #6E6E73, discret #4A4A4A.
- Couleur d'accent : rouge YouTube (#FF0000). Les boutons principaux portent un
  dégradé (#FF453A → #CC0000) avec un léger halo rouge. L'accent est réservé à
  l'action principale de chaque écran, aux liens, aux éléments actifs — et à
  rien d'autre.
- Typographie : Plus Jakarta Sans. Titre de page 20–24 px en 800, titres de
  carte 15–16 px en 700, corps 13–14 px, légendes 11 px. Chiffres tabulaires
  quand ils s'alignent.
- Badges d'état en pastilles arrondies, fond teinté à ~13 % : vert (#32D74B) =
  terminé/actif, ambre (#FFD60A) = en cours/en attente, rouge (#FF453A) =
  échec/bloqué, gris (#8E8E93) = brouillon.
- Structure : barre supérieure fine (logo GenTube — « Gen » blanc, « Tube »
  rouge — et l'avatar), puis une sidebar gauche de 256 px sur fond #0B0B0C et
  le contenu à droite. Entrées de la sidebar : Équipe, Projets, Général,
  Facturation, Activité, Sécurité. L'entrée active porte un fond #1C1C1E et
  son icône en rouge.
- Contenu organisé en cartes empilées séparées de 24–32 px, largeur maximale
  de 672 px pour les formulaires, pleine largeur pour les listes.
- Sur mobile : la sidebar devient un menu hamburger, les cartes passent en
  pleine largeur, les lignes de tableau deviennent des blocs empilés.

Contraintes de fidélité : wireframes finaux, prêts à implémenter. Les vignettes
de vidéos sont des rectangles en dégradé sombre à dominante rouge (#1a0508 →
#450a0f). Pas d'images décoratives hors vignettes ; les halos rouges sont
réservés au hero et aux actions principales. Chaque écran doit montrer ses
états vides, de chargement et d'erreur.

Contenu : rédige tous les libellés en français, et utilise des données
d'exemple crédibles pour le marché (noms béninois et ivoiriens, montants en
FCFA avec un espace comme séparateur de milliers, thèmes de vidéos africains).
```

## 2.3 Écran 1 — Page d'accueil publique

```
Wireframe de la page d'accueil publique de GenTube (visiteur non connecté).

Objectif : faire comprendre en dix secondes qu'on peut produire une vidéo
YouTube complète à partir d'une phrase, et qu'on paie en FCFA par mobile money.

Sections, de haut en bas :
1. Barre de navigation : logo GenTube, liens Tarifs et Connexion, bouton
   orange "Créer un compte".
2. Accroche : un titre court, une phrase d'explication, le bouton orange
   principal, et juste en dessous la mention "Paiement mobile money — à partir
   de 15 000 FCFA/mois". Pas de carte bancaire exigée : le dire.
3. Le parcours en quatre étapes, alignées horizontalement, chacune avec un
   pictogramme au trait : "Décris ton thème" → "L'IA écrit le storyboard" →
   "Tu réécris ce que tu veux" → "Publication sur ta chaîne".
4. Aperçu du produit : un cadre rectangulaire représentant l'éditeur de
   storyboard, avec trois plans visibles. Ce n'est pas une capture, c'est un
   schéma simplifié.
5. Tarifs : deux cartes côte à côte, Starter 15 000 FCFA et Pro 30 000 FCFA,
   avec pour chacune le nombre de crédits et l'équivalent en minutes de vidéo
   ("1 320 crédits ≈ 22 min en 480p"). Une troisième carte Business sur devis.
   Sous les cartes, une ligne explicative : "1 crédit = 1 seconde de vidéo en
   480p (3 crédits en 720p). Les crédits achetés n'expirent pas." Puis une
   ligne ambre : "Offre fondateurs — les 15 premiers comptes gardent leur
   tarif pendant 1 an."
6. Pied de page sobre.

Montre aussi la variante mobile de la section accroche et de la section tarifs.
```

## 2.4 Écran 2 — Inscription et connexion

```
Wireframe des écrans d'inscription et de connexion de GenTube.

Formulaire centré, carte de 400 px de large maximum, logo au-dessus.

Inscription : nom, email, mot de passe, bouton orange "Créer mon workspace",
et une ligne sous le bouton indiquant qu'un workspace est créé automatiquement
et que l'utilisateur en devient propriétaire. Lien vers la connexion.

Connexion : email, mot de passe, bouton orange "Se connecter", lien mot de
passe oublié, lien vers l'inscription.

Montre trois états du formulaire de connexion : vide, en cours de soumission
(bouton avec indicateur de chargement, champs désactivés), et en erreur
(message rouge sous le champ concerné, texte "Email ou mot de passe
incorrect" — le message ne dit jamais lequel des deux est faux).
```

## 2.5 Écran 3 — Tableau de bord du workspace

```
Wireframe de la page d'accueil du tableau de bord GenTube, route /dashboard.
Titre de page : "Workspace".

Trois cartes empilées :

1. "Plan et crédits" — à gauche le plan courant ("Plan : Pro") avec une
   pastille verte "actif" et la date de renouvellement ; à droite, en gros
   chiffre tabulaire, le solde de crédits (2 700) et en dessous sa traduction
   en minutes : "crédits ≈ 45 min en 480p · 15 min en 720p". Un lien discret
   "gérer mon plan et mes crédits". Tout en bas de la carte, en petit :
   "1 crédit = 1 s en 480p · 3 crédits = 1 s en 720p".
   Montre aussi la variante solde à zéro : le chiffre est là, et une ligne
   rouge indique que la génération est bloquée jusqu'à la recharge.

2. "Membres du workspace" — liste avec avatar en initiales, nom, rôle en
   dessous, et un bouton "Retirer" à droite, absent pour soi-même et pour les
   membres si l'utilisateur courant est un simple membre.

3. "Inviter un membre" — champ email, choix du rôle en boutons radio
   (Membre / Administrateur / Propriétaire), bouton orange "Inviter". Si
   l'utilisateur n'a pas le droit d'inviter, les champs sont inertes et une
   ligne explique pourquoi.

Montre l'état de chargement : les cartes en squelette gris animé.
```

## 2.6 Écran 4 — Liste des projets

```
Wireframe de la liste des projets GenTube, route /dashboard/projects.

En-tête : titre "Projets" à gauche, bouton orange "Nouveau projet" à droite.

Liste de cartes cliquables, une par projet, en pleine largeur. Chaque carte :
- à gauche : nom du projet en gras, et en dessous le début du prompt de style
  sur une seule ligne tronquée ;
- à droite, alignés : le pipeline par défaut ("Mixte", "Images", "Vidéo") avec
  le mot "pipeline" en légende, le nombre de vidéos avec "vidéos" en légende,
  et la date de dernière modification avec "modifié" en légende.
Survol : la bordure de la carte passe en orange clair.

Données d'exemple : "Histoires du Bénin" (mixte, 4 vidéos), "Recettes rapides"
(images, 12 vidéos), "Actu tech Abidjan" (vidéo, 0 vidéo).

Montre aussi l'état vide : une carte centrée avec un pictogramme de pellicule,
le titre "Aucun projet", un paragraphe expliquant qu'un projet porte un style,
une voix, une chaîne YouTube et un pipeline par défaut, et que chaque vidéo en
hérite, puis un bouton orange "Créer le premier".
```

## 2.7 Écran 5 — Configuration d'un projet

```
Wireframe de la page de configuration d'un projet GenTube, route
/dashboard/projects/[id]. Lien de retour "← Projets" en haut, puis le nom du
projet en titre.

Carte 1 — "Configuration", formulaire de 672 px maximum :
- Nom (champ texte).
- "Pipeline par défaut" : trois boutons radio empilés, chacun avec son libellé
  et une ligne d'explication en dessous —
  Images ("plans fixes sur une voix off, le moins cher par minute"),
  Vidéo ("clips animés, 1 crédit/s en 480p, 4 en 720p"),
  Mixte ("décidé plan par plan dans le storyboard").
  Sous le groupe : "Chaque nouvelle vidéo part de ce réglage et peut le
  redéfinir."
- "Prompt de style" : zone de texte multiligne, avec l'explication "ajouté
  devant chaque prompt de plan — le rendu que tout le projet partage".
- "Voix" : sélecteur déroulant — voix Amazon Polly par défaut (Léa, Rémi…) ;
  les voix ElevenLabs et les identifiants personnalisés restent visibles mais
  verrouillés hors plans Pro et Business.
- "Chaîne YouTube" : chip de chaîne connectée (« ✓ Histoires du Bénin ») avec
  un lien « gérer les chaînes » vers l'écran 10 ; si aucune chaîne n'est
  connectée, un bouton « Connecter ma chaîne ».
- Bouton orange "Enregistrer".

Carte 2 — "Vidéos" : en-tête avec le titre à gauche et un bouton orange
"Nouvelle vidéo" à droite. Liste compacte : titre de la vidéo à gauche, à
droite les crédits ("25 crédits est." ou "25 crédits débités") puis une
pastille d'état (brouillon, validée, en génération, rendue, publiée, échec).
Montre l'état vide de cette carte.

Carte 3 — "Zone dangereuse" : un paragraphe expliquant qu'un projet contenant
des vidéos ne peut pas être supprimé, parce que ces vidéos portent des crédits
consommés et des identifiants publiés. Puis un bouton "Supprimer le projet" en
variante contour. Montre les trois états : bouton au repos ; après un premier
clic, remplacé par "Confirmer la suppression" en rouge plus un lien "Annuler" ;
et le cas refusé par le serveur, avec un message rouge sous les boutons :
« "Histoires du Bénin" contient encore 4 vidéos. Supprime-les d'abord. »
Montre enfin la variante pour un simple membre : à la place des boutons, la
phrase "Seul un propriétaire ou un administrateur peut supprimer un projet."
```

## 2.8 Écran 6 — Nouvelle vidéo

```
Wireframe du formulaire de création d'une vidéo GenTube, route
/dashboard/projects/[id]/videos/new. Retour "← Histoires du Bénin", titre
"Nouvelle vidéo", une seule carte de 672 px intitulée "On fait quoi ?".

Champs :
- Titre (texte).
- Thème : zone de texte multiligne, exemple de contenu "Les femmes guerrières
  du royaume du Dahomey, de leur fondation à la conquête française."
  Explication en dessous : "C'est à partir de ça que le storyboard est écrit.
  Laissé vide, le titre est utilisé."
- Résolution : deux boutons radio, 480p ("1 crédit par seconde") et 720p
  ("3 crédits par seconde").
- Pipeline : quatre boutons radio — "Hériter du projet (mixte)", "Images
  seulement", "Vidéo seulement", "Mixte".
- Bouton orange "Créer la vidéo".

Ajoute, sous le bouton, un encadré discret qui rappelle qu'aucun crédit n'est
débité à cette étape : le débit a lieu à la validation du storyboard.
```

## 2.9 Écran 7 — Éditeur de storyboard (écran central)

```
Wireframe de l'éditeur de storyboard de GenTube, route /dashboard/videos/[id].
C'est l'écran principal du produit : soigne-le plus que les autres.

À comprendre du modèle avant de dessiner : chaque scène porte DEUX textes — la
narration, que la voix lira, et le prompt visuel, en anglais. La durée d'une
scène n'est jamais saisie : elle est lue sur la narration tant que la voix off
n'existe pas, puis mesurée sur l'audio réel. Le prix ne devient exact qu'après
l'enregistrement de la voix, et la validation n'est possible qu'à ce moment-là.

En-tête : retour "← Histoires du Bénin", puis sur une ligne le titre de la
vidéo "Les Amazones du Dahomey", une pastille grise "brouillon", et en gris
"480p · 16:9 · pipeline mixte".
Sous le titre, deux onglets : "Storyboard" (actif) et "Studio" — voir §2.9 ter.

Carte "Thème" : le texte du thème, en lecture seule.

Carte "Storyboard", en haut :
- à gauche, en gros chiffre tabulaire, le coût (25) avec en dessous
  "crédits estimés · 25 s de narration en 5 scènes en 480p" ;
- à droite, un bouton "Régénérer" en variante contour, avec sous lui
  "Régénérer remplace toutes les scènes ci-dessous" ;
- en dessous, pleine largeur, l'action principale orange, qui DÉPEND de l'état :
  tant que les durées sont estimées, c'est "Enregistrer la voix off", avec sous
  le bouton "Tant que la voix n'existe pas, le prix ci-dessus n'est qu'une
  estimation lue sur le texte. L'enregistrer mesure chaque scène — le montant
  devient exact." Une fois la voix enregistrée, le même emplacement affiche
  "Valider et débiter 25 crédits".

Puis la liste des scènes, une carte par scène, contenant :
1. Une première ligne : le numéro (#1), le type en deux boutons radio avec
   pictogrammes (Image / Vidéo), puis la DURÉE en lecture seule sous forme de
   valeur + pastille — "5.28s" avec une pastille verte "mesurée", ou "5s" avec
   une pastille grise "estimée". Ce n'est jamais un champ de saisie. À droite,
   trois boutons icônes : flèche haut, flèche bas, corbeille rouge.
2. Un champ "Narration" : zone de texte multiligne, en français, avec dessous
   "Ce que la voix lit. Sa longueur fait la durée de la scène — et ce qui vous
   est facturé. La réécrire efface l'audio enregistré."
3. Un champ "Prompt visuel" : zone de texte multiligne, en anglais, avec dessous
   "En anglais : les modèles d'image et de vidéo sont entraînés dessus."
4. Un bouton "Enregistrer la scène" en variante contour.

Données d'exemple, à respecter dans les deux langues :
- narration : "Au XVIIe siècle, un royaume d'Afrique de l'Ouest confie sa garde
  à des femmes." / prompt : "Wide establishing shot of the royal palace of
  Abomey at dawn, warm light, mist over the walls"
- narration : "On les appelle les Amazones. Elles s'entraînent chaque jour,
  pieds nus, dans la poussière." / prompt : "Amazon warriors training in
  formation, dust rising, slow motion"

Enfin une carte "Ajouter une scène" : type, champ narration, champ prompt
visuel, bouton "Ajouter la scène". Aucun champ de durée.

Montre impérativement ces variantes :
1. Storyboard vide : carte centrée "Aucune scène pour l'instant. Génère un
   premier jet, puis réécris ce que tu veux." et bouton principal orange
   "Générer le storyboard".
2. Génération en cours : "Écriture du storyboard…" avec indicateur.
3. Voix off en cours : "Enregistrement de la voix…" — plusieurs secondes par
   scène, l'écran doit rester lisible.
4. Voix off partielle : certaines scènes "mesurée", d'autres "estimée", bouton
   principal toujours "Enregistrer la voix off" avec "3 scènes sur 5 déjà
   enregistrées".
5. Solde insuffisant après mesure : bouton Valider inerte, ligne rouge "Solde de
   10 crédits — il manque 15. Recharge depuis la facturation."
6. Erreur du modèle : message rouge au niveau du bouton Générer ; les scènes
   déjà présentes sont intactes.
7. Clé de voix manquante (message pour l'exploitant) : bandeau ambre
   "ELEVENLABS_API_KEY est absente : la voix ne peut pas être enregistrée, donc
   le prix reste une estimation et la vidéo ne peut pas être validée."
8. Vidéo validée (lecture seule) : plus de champs, plus de flèches, plus de
   corbeille — narration, visuel et durée en texte figé, et en haut "Cette
   vidéo est validée — 25 crédits ont été débités."
9. Version mobile de la carte de scène : les deux zones de texte pleine largeur,
   contrôles sur deux lignes, flèches atteignables au pouce.
```

## 2.9 bis — Le sound design d'une scène (à concevoir)

```
Wireframe d'un panneau de sound design pour une scène de GenTube. À concevoir :
le modèle de données existe, l'interface non.

Contexte : chaque scène peut porter des bruitages, une ambiance ou une nappe
musicale, choisis dans une bibliothèque partagée (51 sons dans le catalogue
d'origine). Chaque son a un type (sfx / ambiance / musique), des mots-clés
d'ambiance, une durée, un caractère bouclable, et surtout ses PICS D'IMPACT en
secondes — les instants où il frappe, ce qui permet de le caler sur une coupe.

Section repliable sous une scène, ou panneau latéral, contenant :
- La liste des sons attachés : nom, type, curseur de volume, champ de décalage
  en secondes, case "boucler", corbeille.
- Un bouton "Ajouter un son" ouvrant un sélecteur : recherche par mots-clés,
  filtres par type, et pour chaque résultat le nom, la durée, les mots-clés, un
  bouton d'écoute, et les pics d'impact affichés comme de petits repères sur une
  mini-timeline.
- En bas, un rappel du volume global des bruitages, réglable pour la vidéo
  entière.

Montre l'état vide ("Aucun son sur cette scène") et le cas d'un son plus long
que la scène, avec la mention que seul le début sera joué.
```

## 2.9 ter — Le Studio Hyperframes (aperçu + timeline)

```
Wireframe du Studio embarqué de GenTube, onglet « Studio » de
/dashboard/videos/[id]. C'est @hyperframes/studio (React 19 + Tailwind)
embarqué : aperçu, scrub et timeline visuelle. Deux règles absolues : le
panneau de code (CodeMirror) est masqué — timeline et aperçu seuls, jamais un
éditeur HTML/JS pour les clients — et le paquet est chargé en lazy, version
épinglée à l'exact.

Disposition :
- À gauche, l'aperçu 16:9 avec halo rouge : l'image courante à la position du
  curseur, le sous-titre karaoké incrusté (mot courant en rouge), badge de
  position « 0:07,2 » et durée totale « 0:30 », badge de scène en bas à gauche.
- Sous l'aperçu, le transport : retour, lecture/pause rouge, avance, position
  « 0:07,2 / 0:30 », mini-barre de progression.
- À droite, l'inspecteur de la scène sélectionnée : titre « Scène #2 », pastille
  « mesurée », position exacte dans le temps (lecture seule), transition
  entrante (sélecteur aligné sur shader-transitions), zoom, style de
  sous-titres, les sons de la scène (chips avec ✕), « + Ajouter un son »,
  « Régénérer cette scène » en contour.
- En bas, la timeline pleine largeur : règle en secondes (0 s → 30 s), puis
  quatre pistes étiquetées —
  · Visuels : un bloc par scène (vignette + #n), séparés par le marqueur de
    transition ⇄ ; le bloc sélectionné a un bord blanc ;
  · Voix off : un bloc de forme d'onde par narration, aligné sur sa scène ;
  · Musique : un bloc pleine durée « ambiance marché · volume 0,09 · le mix
    creuse la voix automatiquement » (voiceover carve d'Hyperframes) ;
  · SFX : petits marqueurs rouges posés sur les impacts (pop, whoosh…).
- Tête de lecture rouge verticale traversant les quatre pistes, poignée sur la
  règle. Contrôles de zoom (− / 100 % / + / Ajuster) en haut à droite.
- Interactions : glisser un bloc pour le déplacer dans sa piste, cliquer pour
  sélectionner (l'inspecteur suit), scruber n'importe où — toute position rend
  une image exacte (temps déclaré, jamais accumulé).
- Mobile : aperçu au-dessus, timeline défilable horizontalement au doigt,
  inspecteur en feuille glissante sous la timeline.
```

## 2.10 Écran 8 — Progression du pipeline (à concevoir)

```
Wireframe de l'écran de suivi d'une vidéo GenTube en cours de production. Cet
écran n'existe pas encore : c'est ce qu'affiche /dashboard/videos/[id] quand la
vidéo est passée en génération.

Contexte technique à refléter : les plans sont générés en parallèle, un clip de
5 s en 480p prend 30 à 40 secondes, une vidéo de 2 minutes fait ~15 clips.
L'attente est de plusieurs minutes et ne doit pas ressembler à un blocage.

Structure :
- En-tête identique à l'éditeur, avec une pastille ambre "en génération".
- Une carte de progression globale : une barre, le compte "8 plans sur 15
  prêts", et une estimation de temps restant volontairement floue ("encore
  quelques minutes").
- Les étapes du pipeline en liste verticale, chacune avec son état : Voix off
  (terminé), Plans (en cours, 8/15), Assemblage (en attente), Publication
  (en attente). Chaque étape porte une icône d'état et une heure.
- La liste des plans, en lecture seule, chacun avec sa propre pastille : prêt,
  en cours, en attente, échec. Un plan en échec affiche un bouton "Relancer ce
  plan" et le message d'erreur du fournisseur, tronqué.

Montre aussi l'état "échec global" : bandeau rouge en haut expliquant que le
pipeline a cassé, que les crédits consommés ont été remboursés, et un bouton
"Remettre en brouillon pour corriger".
```

## 2.11 Écran 9 — Facturation

```
Wireframe de la page de facturation de GenTube, route /dashboard/billing.
Titre "Facturation".

Carte 1 — "Plan courant" : à gauche le nom du plan avec une pastille d'état et
la date de renouvellement ; à droite le solde de crédits en gros chiffre avec
sa traduction en minutes de 480p.
Montre la variante "abonnement suspendu" : pastille rouge et un paragraphe
expliquant que le paiement a échoué trop de fois, que le renouvellement est
arrêté, que les crédits déjà achetés sont intacts, et qu'un nouveau paiement
relance tout.

Carte 2 — "Plans" : une ligne par offre. À gauche "Starter — 15 000 FCFA"
avec "/mois" en gris, et en dessous "1 320 crédits ≈ 22 min en 480p". À droite
un bouton orange "Payer 15 000 FCFA", remplacé par la mention grise "Plan
actuel" pour le plan en cours. Sous la liste, une ligne : "Mobile money ou
carte, en XOF, via GeniusPay. Les plans Business sont sur devis."

Carte 3 — "Recharger des crédits" : "360 crédits — 5 000 FCFA", avec en
dessous "Les crédits achetés n'expirent pas, contrairement au quota mensuel",
et un bouton contour "Payer 5 000 FCFA".

Carte 4 — "Historique des paiements" : liste avec, à gauche, le type
("Abonnement — pro" ou "Recharge de crédits") et en dessous la date et les
crédits accordés ; à droite le montant en FCFA et une pastille d'état
(réussi, en attente, échoué, annulé). Montre l'état vide.

Variantes à montrer impérativement :
1. Bandeau vert de retour de paiement : "Paiement reçu. Les crédits
   apparaissent dès que GeniusPay confirme — quelques secondes en général."
   C'est important : le solde n'est pas mis à jour à l'instant du retour.
2. Bandeau rouge d'échec : "Le paiement n'a pas abouti. Rien n'a été débité."
3. Bandeau ambre de non-configuration, destiné à l'exploitant : les clés de la
   passerelle manquent, le paiement est désactivé.
4. Simple membre : tous les boutons de paiement inertes, avec la phrase "Seul
   un propriétaire ou un administrateur peut payer pour ce workspace."
5. Version mobile complète de l'écran : c'est là que le paiement se fera le
   plus souvent.
6. Badge ambre "★ Tarif fondateur — figé 1 an" à côté du plan actif : les
   15 premiers clients gardent leur tarif pendant un an.
```

## 2.12 Écran 10 — Connexion de chaîne YouTube (à concevoir)

```
Wireframe de l'écran de connexion d'une chaîne YouTube dans GenTube. À
concevoir : rien n'est encore construit.

Contexte à refléter : chaque tenant connecte sa propre chaîne par OAuth Google.
La plateforme ne possède aucune chaîne, elle publie au nom du client. Le jeton
de rafraîchissement est chiffré côté serveur et n'est jamais réaffiché. Un
créateur qui gère plusieurs chaînes est le cas normal.

État vide : une carte centrée, pictogramme, titre "Aucune chaîne connectée",
un paragraphe expliquant que GenTube publiera sur la chaîne du client et
demandera l'autorisation Google, et un bouton orange "Connecter ma chaîne
YouTube". Sous le bouton, la liste en clair des autorisations demandées :
publier une vidéo, lire la chaîne, lire les statistiques.

État connecté : une carte par chaîne, avec la miniature de la chaîne, son nom,
la date de connexion, une pastille verte "connectée", et un bouton contour
"Déconnecter". Un bouton "Connecter une autre chaîne" en dessous.

Montre aussi :
1. La confirmation de déconnexion, en deux temps, avec la mention que
   l'autorisation est révoquée côté Google puis effacée chez nous.
2. Un état d'erreur : "La connexion a expiré, reconnecte ta chaîne", pastille
   rouge, sans jamais afficher de jeton.
3. Un encadré d'information sur le quota : "Environ 100 publications par jour,
   toutes chaînes confondues sur la plateforme. Au-delà, les vidéos sont mises
   en file et publiées le lendemain." Présenté comme une règle du jeu et non
   comme une panne.
```

## 2.13 Écran 11 — Publication et statistiques (à concevoir)

```
Deux wireframes liés pour GenTube, tous deux à concevoir.

Écran A — Publication d'une vidéo rendue. Aperçu du MP4 à gauche (simple cadre
avec un bouton lecture), formulaire à droite : titre YouTube, description,
mots-clés, choix de visibilité (publique / non répertoriée / privée), et un
sélecteur "publier maintenant ou programmer" avec date et heure. Bouton orange
"Publier sur la chaîne". Sous le bouton, le nom de la chaîne de destination,
pour qu'il n'y ait aucun doute sur où ça part. Montre l'état "programmée" :
bandeau ambre avec la date prévue et un bouton "Annuler la programmation".

Écran B — Statistiques. En haut, quatre indicateurs sur une ligne : vues,
likes, commentaires, durée de visionnage. Chacun avec sa valeur en gros et sa
variation depuis la veille. En dessous, un graphique linéaire simple de la
progression des vues sur 30 jours — l'historique daté compte plus que le
chiffre du jour. Puis un tableau des vidéos publiées : titre, date de
publication, vues, likes, durée de visionnage, avec tri par colonne. Montre
l'état vide ("aucune vidéo publiée pour l'instant") et l'état "statistiques en
cours de récupération" (les chiffres sont rafraîchis une fois par jour, le
dire).
```

## 2.14 Variante pour générateur d'images

Les prompts ci-dessus sont écrits pour un générateur qui produit du code. Pour
un générateur d'images, il faut une formulation plus visuelle et beaucoup plus
courte, un écran à la fois :

```
Wireframe d'interface web haute fidélité, thème sombre, style Tailwind et
shadcn/ui : éditeur de storyboard vidéo. Sidebar gauche étroite avec cinq
entrées de menu, contenu principal à droite. En haut, une carte affichant un
grand chiffre "25" avec la légende "crédits estimés" et un bouton orange vif
"Valider et débiter 25 crédits". En dessous, une pile de cinq cartes
identiques : chacune avec un numéro de plan, deux boutons radio "Image" et
"Vidéo", un petit champ de durée, trois icônes à droite (flèche haut, flèche
bas, corbeille), et une grande zone de texte contenant une description de plan.
Palette : noir profond, anthracite, blanc, un seul accent rouge avec dégradé
sur les boutons ; vignettes en dégradé sombre à dominante rouge. Vue de face,
capture d'écran à plat, proportions 16:10.
```

Règles pour décliner cette variante sur les autres écrans : un seul écran par
prompt, décrire la disposition de haut en bas, nommer les composants
(« carte », « pastille », « champ »), donner les textes exacts entre guillemets,
et finir par la palette et le cadrage.

---

## 2.15 Ce que les wireframes doivent trancher

Questions de conception encore ouvertes, à régler par le dessin avant d'écrire
le code correspondant :

1. **Le glisser-déposer du storyboard.** Aujourd'hui ce sont deux flèches. Le
   contrat serveur accepte déjà une liste ordonnée complète, donc le drag est
   posable sans rien changer côté API. Reste à décider ce qu'on montre pendant
   le déplacement, et comment ça se comporte au doigt sur mobile.
2. **Le sound design.** Le modèle porte les bruitages par scène, avec leurs
   pics d'impact ; rien ne les expose encore. Section repliable, panneau latéral
   ou écran dédié ? C'est ce qui reste de plus lourd à poser sur l'écran central
   (voir 2.9 bis).
3. **L'attente.** Plusieurs minutes de génération. On reste sur la page avec un
   suivi plan par plan, ou on rend la main avec une notification ?
4. **Le plafond de publication.** Six vidéos par jour pour toute la plateforme :
   comment présenter une file d'attente partagée entre tenants sans donner
   l'impression d'un service en panne, ni révéler l'activité des autres clients.
5. **La traduction crédits ↔ FCFA ↔ minutes.** Elle apparaît sur cinq écrans.
   Il faut une formulation unique, décidée une fois, réutilisée partout.
