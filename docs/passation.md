# GenTube — briefing de passation

Ce document explique **ce qui existe, pourquoi c'est comme ça, et ce que ça a
coûté de l'apprendre**. Le code raconte le « comment » ; ici on raconte le
« pourquoi », qui ne se lit nulle part ailleurs.

---

## 1. Ce que fait GenTube

On tape un sujet. On récupère une vidéo prête à publier.

L'application écrit le texte parlé, l'enregistre en voix française, découpe le
récit en scènes, produit chaque image et chaque plan animé, allume les
sous-titres mot par mot, cale la musique et les bruitages sur les coupes,
monte le tout et l'envoie sur la chaîne YouTube du client.

**Le client :** créateurs, écoles, radios et petites entreprises d'Afrique de
l'Ouest francophone. Prix en FCFA, paiement par mobile money sans carte
bancaire, interface en français.

**Multi-locataire :** une agence pilote plusieurs clients depuis un seul
compte, chacun cloisonné.

**Ce qui change tout pour un développeur qui arrive :** chaque seconde de
vidéo coûte de l'argent réel chez un fournisseur. Ce n'est pas une application
CRUD, c'est une machine à dépenser — et presque toutes les décisions
d'architecture du projet viennent de là.

---

## 2. La stack, et pourquoi

### L'application — Next.js 15, React 19

App Router, server actions. Les formulaires appellent des actions serveur, pas
une API REST. Conséquence : il n'y a que **5 routes API**, et elles existent
pour des appelants qui ne sont pas le navigateur (le webhook de paiement, et
n8n).

### La base — PostgreSQL + Drizzle

Drizzle est l'ORM. Le schéma est du TypeScript, les migrations sont générées
depuis lui (`drizzle-kit generate`).

**Le piège à connaître :** `lib/db/migrations/meta/_journal.json` est réécrit à
chaque génération de migration. Deux personnes qui en génèrent une le même
jour créent un conflit qui ne se résout pas tout seul. Une seule personne
devrait posséder le schéma.

### Le stockage — Cloudflare R2

Compatible S3, donc on utilise `@aws-sdk/client-s3` avec la région `auto`. Les
fichiers ne sont **jamais publics** : on les sert par des URLs signées à durée
de vie courte.

Choisi pour une raison précise : R2 ne facture pas la sortie de données.
Une plateforme vidéo qui paierait chaque lecture aurait un coût qui monte avec
le succès.

### Le texte — DeepSeek

Écrit le storyboard : la narration de chaque scène, plus un prompt visuel en
anglais.

**Piège rencontré :** c'est un modèle de raisonnement. Avec un budget de
tokens trop serré, il dépense tout en raisonnement et renvoie un contenu vide.
Le client lève une erreur explicite plutôt que d'écrire un storyboard vide.

### La voix, en deux passes

C'est la partie la plus contre-intuitive du produit, et elle vient d'une
contrainte de caisse. Le prix d'une vidéo est la somme des durées de ses
scènes, et une durée s'obtient en faisant lire la phrase. Il faut donc parler
avant que le client valide, y compris pour les devis qui n'aboutiront jamais.
Payer Polly ou ElevenLabs à ce moment-là, c'est payer chaque devis.

**Passe 1, mesurer.** Edge TTS, le service de lecture à voix haute du
navigateur Edge. Gratuit, et il rend des *word boundaries*, donc les timings
mot à mot. C'est cette passe qui fixe le prix affiché sur le bouton.

**Passe 2, livrer.** Après validation, la voix du plan. Polly Neural sur
Starter (16 $ le million de caractères), ElevenLabs sur Pro et Business. Elle
écrase le même objet R2 et refait les timings, qui doivent suivre la voix
réellement entendue.

La seconde passe ne rejoue jamais le calcul du prix. Le débit est écrit une
fois à la validation avec une clé d'idempotence. Si la voix livrée dure un peu
plus longtemps, la scène s'allonge pour que le renderer ne coupe pas un mot,
et l'écart est pour nous. Elle ne raccourcit jamais sous ce qui a été payé.

Deux avertissements. Chez Polly, les timings s'appellent *Speech Marks*, se
demandent dans un second appel et se facturent comme un appel de synthèse. Et
Edge TTS n'est pas une API publique : ni contrat, ni garantie de stabilité, et
il se trouve sur le chemin du prix. Le jour où il casse, il faut basculer la
mesure sur Polly, ce que `lib/voice/index.ts` permet en une ligne.

### Les images — Flux sur Cloudflare Workers AI

Modèle `flux-2-klein-4b`. Coût mesuré : **0,00045 $** une image en 480p,
**0,00101 $** en 720p.

Pourquoi pas `flux-1-schnell`, plus connu : il ne prend pas de dimensions et
rend du carré 1024×1024. Un carré dans une trame 16:9 se recadre, donc on
paierait des pixels pour les jeter, et le sujet cadré par le prompt sortirait
du champ une fois sur deux.

### Les plans animés — Wan sur Replicate

`wan-video/wan-2.2-i2v-fast`. De l'**image-to-video** : on anime l'image déjà
générée au lieu de repartir de zéro. Moins cher, et le plan ressemble à ce que
le storyboard décrivait.

**Facturation par vidéo générée, pas par seconde** : 81 images à 16 fps font
5,06 s de clip, à 0,05 $ en 480p et 0,11 $ en 720p.

### Le montage — HyperFrames

Framework de HeyGen, Apache 2.0. Il transforme du **HTML en MP4** : un Chrome
headless joue la page, FFmpeg encode. La composition est donc du code React
ordinaire, avec `data-start` et `data-duration` en secondes.

**Pourquoi on a quitté Remotion :** sa licence commerciale devient payante
au-delà de 3 personnes. Le portage a coûté 413 lignes et aucune dépendance
installée, parce que le contrat de rendu était déjà isolé dans un seul
fichier.

**La règle non négociable du montage :** le moteur **cherche chaque image**
(`seek`) au lieu de jouer la vidéo. Une animation qui accumule du temps
(`requestAnimationFrame`, un compteur qui s'incrémente) marche parfaitement
dans l'aperçu et se casse au rendu. Toute animation doit se calculer à partir
du temps **déclaré**, jamais accumulé.

### Le rendu — AWS Lambda

Le montage tourne sur Lambda, pas sur notre serveur. Un Chrome et un FFmpeg
qui tournent 30 secondes par vidéo ne justifient pas une machine payée à
l'année. `@hyperframes/aws-lambda` fournit déjà le déploiement et le suivi de
progression : c'est surtout de la configuration.

### Le paiement — GeniusPay

Mobile money. Plafond de **500 000 FCFA par mois pour toute la plateforme**,
commission 1,5 %. Ce plafond est une limite de croissance, à surveiller.

### L'orchestration — n8n

Enchaîne les étapes : voix off → images → clips → rendu → publication. Gère
aussi les notifications (vidéo prête, génération échouée, paiement raté).

**n8n ne touche jamais Postgres.** Il appelle des routes internes signées.
Sinon deux systèmes écrivent dans la même base avec deux idées différentes de
ce qui est vrai.

---

## 3. Les trois règles qui ne plient jamais

### 1. La clé d'un fichier commence toujours par l'identifiant du client

`assetKey(tenantId, ...)` construit `<tenant>/…` et rejette tout ce qui
pourrait en sortir — un `..` dans une clé est la façon dont un client lit les
fichiers d'un autre. Une URL signée fuit un objet, jamais le dossier du
voisin.

Imposé dans **une seule fonction**, pas à chaque endroit qui écrit un fichier.
Prouvé par un test.

### 2. Une durée est mesurée, jamais devinée

La voix off tourne **avant** les visuels. Deux raisons : elle coûte des
centimes là où les visuels coûtent le prix de la vidéo, et c'est le seul moyen
de connaître la durée réelle d'une scène.

Conséquence : le montant affiché avant validation est le montant débité, à
l'unité près. Le code refuse de facturer une vidéo dont une scène est encore
estimée.

Personne n'écrit une durée à la main. Le prompt du modèle le lui interdit
explicitement.

### 3. On débite avant de dépenser

Une vidéo en brouillon n'a rien payé, donc l'étape image la refuse. Sinon un
compte gratuit fait générer pour 8 000 FCFA puis disparaît.

---

**Ce qui rend ces règles tenables :** chacune est gardée par un test, et
écrite dans le commentaire de la fonction qu'elle protège — pas dans un wiki.
Un développeur qui en casse une le sait en 90 secondes.

C'est la leçon la plus transférable du projet : **ce qui est promis dans un
commentaire sans test est un vœu**, et on l'a appris en trouvant un invariant
faux (section 6).

---

## 4. L'argent

### L'unité

**1 crédit = 1 seconde d'image fixe en 480p.**

|            | 480p        | 720p |
| ---------- | ----------- | ---- |
| Image fixe | 1 crédit/s  | 3    |
| Plan animé | 2 crédits/s | 6    |

Un plan animé coûte le double parce qu'il nous coûte réellement bien plus :
une minute de clips revient à ~400 FCFA de fournisseur contre ~30 pour des
images fixes. Facturer les deux pareil faisait payer au client « diaporama »
— l'usage d'entrée de gamme, le plus sensible au prix — le tarif de la vidéo
générée.

Le 720p coûte réellement ~2,1× le 480p ; il est facturé 3×, donc il dégage de
la marge au lieu d'être subventionné.

### Ce qu'une minute nous coûte

~400 FCFA en 480p, ~850 FCFA en 720p. Détail dans `docs/tarifs.md`.

### Les plans

| Plan     | Prix        | Crédits | Ce que ça achète                   |
| -------- | ----------- | ------- | ---------------------------------- |
| Starter  | 15 000 FCFA | 2 640   | 22 min animées, ou 44 min d'images |
| Pro      | 30 000 FCFA | 5 400   | 45 min animées, ou 90 min d'images |
| Business | sur devis   | —       | négocié par contrat                |

Recharge : **5 000 FCFA = 720 crédits**. Volontairement plus chère à la minute
que l'abonnement (833 FCFA contre 682) — sinon personne ne s'abonne.

### Deux poches de crédits

Le quota mensuel expire en fin de cycle. Ce que le client a **payé en plus**
n'expire jamais : faire expirer ce qu'on a acheté, c'est du vol.

Deux colonnes séparées, et un débit qui prend **d'abord dans celle qui
périme**, pour que personne ne perde de la valeur qu'il aurait pu consommer.

### L'essai gratuit

**120 crédits, 480p seulement, filigrane.** Une minute animée ou deux minutes
d'images : assez pour juger le résultat, pas assez pour s'en servir comme
abonnement gratuit.

Le filigrane est décidé **au débit**, pas au rendu : une vidéo garde la marque
avec laquelle elle a été payée. Sinon un client qui s'abonne le lendemain
réclamerait le rendu propre de sa vidéo d'essai — et il aurait raison.

### Marge cible : 40 %

Ce n'est pas du bénéfice. Ces 40 % doivent encore payer la commission
GeniusPay, les générations ratées et les régénérations.

### Plafonds externes

- **GeniusPay : 500 000 FCFA/mois** pour toute la plateforme.
- **YouTube : ~6 publications par jour** pour toute la plateforme. Un envoi
  coûte 1 600 unités sur un quota de 10 000 par jour. À faire augmenter tôt.

---

## 5. Ce qui marche, ce qui manque

**La chaîne fait 6 étapes. 4 fonctionnent, et une vidéo complète sort.**

| Étape                                   | État |
| --------------------------------------- | ---- |
| Storyboard écrit par DeepSeek, éditable | ✅   |
| Voix off en deux passes, timings mot à mot | ✅ |
| Images Flux                             | ✅   |
| Montage sur AWS Lambda                  | ✅   |
| Plans animés (Wan)                      | ❌   |
| Publication YouTube                     | ❌   |

Mesuré le 26 août 2026 : une vidéo de 16,4 s montée en 34 s de bout en bout,
base de données comprise, pour 0,0105 $. 492 images rendues sur 52 machines en
parallèle, aucune discontinuité aux jointures de segments.

Ce qui manque pour une vidéo complète, c'est donc uniquement les plans animés.
Une vidéo en images fixes, elle, sort aujourd'hui.

**Solide autour :** comptes et cloisonnement, projets et vidéos, crédits deux
poches avec grand livre et idempotence, paiement GeniusPay et son webhook,
essai gratuit et filigrane, stockage R2. **392 tests**, base de test séparée
qui refuse de tourner contre un hôte distant.

**Manque aussi :** la file de jobs, l'orchestration n8n, les notifications, et
une bonne partie de l'interface — timeline, sound design, écran de production
en direct.

### Un écart refermé le 26 août 2026

Les tarifs annonçaient **Amazon Polly** sur le plan Starter alors que seul
ElevenLabs était codé, ce qui privait ce plan de sa marge de 41 %. C'est
réglé : Polly est codé, testé, et un appel réel a été vérifié en eu-west-3.

Il reste une permission à ne pas perdre de vue. Polly a demandé
`polly:SynthesizeSpeech`, que le compte n'avait pas. Le bloc `VoiceSynthesis`
est dans `render/aws/iam-user-policy.json` ; si quelqu'un régénère cette
politique, il le supprime sans le voir.

---

## 6. Les pièges découverts

La section la plus utile du document. Chacun a coûté quelque chose.

### De l'argent qui fuyait

**L'inscription offrait un mois entier de Starter.** 2 640 crédits par compte
créé, soit ~8 800 FCFA de coût fournisseur — y compris pour dix comptes
ouverts par la même personne. Remplacé par 120 crédits.

**La trame de sortie était toujours en 1920×1080.** La fonction qui la
calculait ne regardait que le ratio, jamais la résolution. Donc le palier 720p
facturé 3× et l'essai bridé en 480p ne changeaient **rien** au fichier livré.

**Workers AI accepte un prompt vide.** Il ne le rejette pas : il rend une
image de bruit et la facture. Le garde-fou doit être chez nous.

### Des fichiers clients exposés

**Le bucket R2 était public**, et partagé avec un autre projet. N'importe qui
avec l'URL lisait les fichiers de n'importe quel client. Corrigé : bucket
dédié, accès public désactivé, URLs signées uniquement.

**Les tests ont écrit dans le bucket de production.** Un test comptait sur le
fait que la configuration manquante ferait échouer l'appel — sauf que le `.env`
de développement était chargé. Deux objets écrits en production.

Le correctif a un piège dans le piège : `delete process.env.X` ne suffit pas,
parce que dotenv est chargé **après** et ne réécrit que les clés absentes. Il
faut poser la chaîne vide. Le garde-fou couvre maintenant R2, Workers AI,
Replicate, ElevenLabs et DeepSeek.

### Des contrats fournisseurs qui mentent

**Workers AI attend du multipart/form-data, pas du JSON.** Un POST JSON répond
« required properties at '/' are 'multipart' », ce qui ne dit pas du tout
qu'il faut changer d'encodage.

**Il rabote les dimensions au multiple de 16 inférieur, sans prévenir.**
Demander 854×480 renvoie 848×480. D'où des trames toutes multiples de 16 :
848×480 et 1280×720.

**Replicate facture par vidéo générée, pas par seconde.**

**DeepSeek renvoie du vide** si le budget de tokens est trop serré.

Leçon commune : **vérifier contre l'API réelle, pas contre la documentation.**
Tous ces points ont été trouvés en appelant le service, aucun n'était écrit.

### Des licences

**Remotion devient payant au-delà de 3 personnes.** C'est ce qui a fait
basculer le projet vers HyperFrames.

**Les paquets npm `@hyperframes/*` n'ont aucun champ `license` dans leur
`package.json`** — mais ils embarquent bien un fichier `LICENSE` Apache 2.0.
La licence existe donc ; c'est la métadonnée qui manque. Un outil d'audit qui
lit `package.json` les signalera quand même en « licence inconnue ». À savoir
avant qu'on vous le demande, surtout pour une équipe qui a changé de
framework _à cause_ d'une licence.

### Des invariants affirmés mais faux

Un commentaire promettait que la pause après la narration dépassait la plus
longue transition. **Elle ne la dépassait pas** : une transition durait 40
images pour une pause de 30, donc la voix d'une scène jouait par-dessus la
suivante. C'est maintenant une table parcourue par un test.

Le générateur de données de test calculait une durée « mesurée » et ne
l'écrivait jamais : mesuré valait toujours estimé.

Une fixture posait un solde sans poche : un client qui affichait des crédits
et ne pouvait rien débiter.

---

## 7. Qui fait quoi

La répartition a été arrêtée le 26 août 2026. Chacun a sa fiche, écrite pour
être lue seule le premier jour. Commence par la tienne, reviens ici ensuite.

| Qui | Sa voie | Sa fiche |
| --- | --- | --- |
| Ezechiel TADAGBE | Orchestration n8n, publication YouTube, les deux agents | `docs/ezechiel.md` |
| Prince KOUCHEME | Toute la logique directe : journal, API d'admin, quotas, statistiques, tooling, chemin de l'argent | `docs/prince.md` |
| Ahmad OUOROU | Les écrans du parcours client | `docs/ahmad.md` |
| Rosaire KAKPO | Les écrans compte et administration | `docs/rosaire.md` |
| Merveille GANDJI | Cloisonnement des comptes, identités, quotas AWS | `docs/merveille.md` |
| Cosme MISSIKPODE | Sécurité logicielle, secrets, isolation, plus les plans animés | `docs/cosme.md` et `docs/plans-animes.md` |

Trois règles qui évitent de se marcher dessus :

1. **n8n ne se partage pas.** Ce n'est pas une étape de plus, c'est l'ordre des
   étapes, et cet ordre porte une règle qu'on ne peut pas violer : la voix
   mesure la durée avant le débit, le débit a lieu une fois, la voix payée
   arrive après. À deux dessus, l'ordre cesse d'exister.
2. **Les frontends font les écrans.** Le côté données de chaque écran qu'Ahmad
   ou Rosaire dessine est écrit par Prince. Les quotas consommés sont un calcul,
   pas un affichage.
3. **Deux personnes seulement génèrent des migrations**, Ezechiel et Prince. Le
   `_journal.json` de Drizzle casse dès que deux branches en produisent en
   parallèle, et Prince aura besoin de colonnes nouvelles pour le journal et les
   statistiques.

## 8. Par où commencer

Dans cet ordre, et l'ordre compte.

**1. Le journal des événements réels.** `activity_logs` existe et ne contient
que des connexions. Tant qu'aucune vidéo générée, aucune erreur et aucun crédit
débité n'y entre, l'administration n'a rien à afficher et la sécurité n'a rien à
auditer. Deux personnes sont bloquées derrière ce point.

**2. Les lectures d'administration.** Il n'existe aujourd'hui aucune route ni
aucun écran d'admin, seulement `app/(dashboard)`. Attention en les écrivant :
une lecture d'admin traverse les tenants, donc elle ne peut pas passer par
`tenantDb()` qui filtre dessus. C'est le genre de requête qui fait fuiter entre
clients.

**3. L'orchestration.** Maintenant c'est possible : quatre étapes sur six
tournent et le montage est prouvé sur Lambda. Ce n'était pas le cas quand ce
document a été écrit.

**4. Les plans animés.** La dépense Replicate est demandée. C'est la dernière
brique qui manque pour qu'une vidéo animée sorte, les vidéos en images fixes
sortant déjà.

**5. La publication et ses statistiques.** Il n'y a ni route OAuth, ni envoi, ni
table de statistiques. L'agent d'analyse ne peut rien proposer avant.

### Où lire quoi

- `docs/tarifs.md` — le chiffrage complet, coûts fournisseurs compris.
- `docs/contrats.md` — les quatre contrats : jobs, n8n ↔ Next.js, plan de
  nommage R2, publication.
- `docs/produit-et-wireframes.md` — les écrans.
- `lib/credits/pricing.ts` — la source unique de vérité sur les prix.
- `lib/storyboard/render.ts` — le contrat de rendu, partagé avec la
  composition.

### Comment vérifier que rien n'est cassé

```bash
pnpm test        # 392 tests, base de test séparée
pnpm typecheck
pnpm build
```
