# GenTube — dossier de soumission

*Cursor × Devs Days. Les sections suivent ce qu'un formulaire de soumission
demande ; à réordonner quand on aura les champs exacts.*

---

## Le pitch

### Décrivez votre vidéo. Voyez le prix. Payez en mobile money.

Trente secondes plus tard, elle est montée : voix off, sous-titres, transitions.
Pas de logiciel à apprendre, pas de carte bancaire, pas de devis.

**→ Créer ma première vidéo — 120 crédits offerts**

---

## Le problème

Un créateur à Abidjan, Cotonou ou Dakar qui veut publier trois vidéos par
semaine a trois options, et aucune ne tient.

**Monter lui-même.** C'est le métier de quelqu'un d'autre. Chaque heure passée
dans un logiciel de montage est une heure qu'il ne passe pas à créer.

**Payer un monteur.** À trois vidéos par semaine, ce n'est plus une dépense,
c'est un poste de dépense.

**Un outil d'IA étranger.** Il faut une carte bancaire qu'il n'a pas, le prix
est en dollars, et l'outil suppose qu'il a déjà une vidéo à découper. Lui n'a
qu'une idée.

Le montage est exactement le travail que personne ne veut faire et que tout le
monde doit faire.

---

## Ce que GenTube fait à sa place

**Il écrit une phrase. Il reçoit une vidéo montée.**

Pas des morceaux à assembler : un fichier MP4 prêt à publier. Les images, la
voix, les sous-titres mot à mot, les transitions et la musique arrivent déjà
assemblés au rythme de la narration.

**Il connaît le prix avant de payer.**

Le montant affiché sur le bouton est le montant débité, au crédit près. Aucun
autre outil ne peut le promettre, parce que le prix dépend de la durée et que
la durée dépend de la voix — donc il faut faire parler la voix avant de
facturer. C'est ce que nous faisons, et ça ne coûte rien.

**Il paie comme il paie tout le reste.**

Mobile money, en FCFA. Pas de conversion, pas de carte.

**Il garde la main sur le scénario.**

Le storyboard s'ouvre avant la production : réordonner une scène, réécrire une
phrase, changer un plan. Le prix se recalcule à chaque geste.

---

## Comment ça marche, de son point de vue

1. **Il décrit sa vidéo** en une phrase, dans sa langue.
2. **Le storyboard s'affiche** — scène par scène, avec le prix de chacune. Il
   ajuste ce qu'il veut.
3. **Il valide.** Le montant est ferme. Il paie en mobile money.
4. **La vidéo arrive.** Il la télécharge ou la publie sur sa chaîne.

---

## Ce qui tourne déjà

Pas une maquette. Mesuré, cette semaine :

| | |
|---|---|
| Une vidéo de 16 secondes, montée | **34 secondes**, de la base de données au fichier livré |
| Coût de rendu réel | **0,01 $** — 492 images sur 52 machines en parallèle |
| Écarts entre prix annoncé et prix débité | **aucun**, par construction |
| Tests automatisés | **392**, tous verts |

Le script, la voix off avec ses sous-titres mot à mot, les images, le montage,
les crédits et le paiement mobile money fonctionnent aujourd'hui.

---

## Ce que nous livrons en 48 heures

Sept voies indépendantes. Aucune n'attend une autre, et chacune se voit dans la
démonstration — un jury note ce qui tourne.

| Qui | Ce qu'il livre | Ce que le jury verra |
|---|---|---|
| **Ezechiel** | La chaîne complète déclenchée par un calendrier | Une vidéo qui se produit sans qu'on clique |
| **Prince** | « Ta vidéo est prête », et la relance d'un échec | Une panne qui se répare sans repayer |
| **Ahmad** | Les écrans du parcours : prompt, storyboard, fabrication, lecteur | Le produit tel qu'un client le vit |
| **Rosaire** | Crédits et paiement mobile money à l'écran, en FCFA | Un achat qui aboutit, en monnaie locale |
| **Merveille** | Musique de fond et sons par scène | Une vidéo qui s'entend, pas seulement qui se voit |
| **Cosme** | Lien de partage à durée de vie courte | Une vidéo qu'on envoie sans la rendre publique |
| **Bahoun** | Les plans animés | Des scènes qui bougent, plus seulement des images |

Quatre membres de l'équipe découvrent le code cette semaine. C'est pourquoi
chaque voie est petite, autonome, et finissable en deux jours.

---

## Ce que Cursor a changé

Une équipe de sept sur un produit qui touche une demi-douzaine de fournisseurs
externes, un rendu distribué et une facturation en crédits. Le travail qui a réellement pris
du temps n'a pas été d'écrire le code, mais de découvrir ce que les
fournisseurs ne documentent pas.

Trois exemples, tous trouvés en confrontant le code au réel plutôt qu'à la
documentation :

- Un modèle d'image acceptait un prompt vide et facturait le bruit qu'il
  générait.
- Notre calcul de durée surfacturait chaque scène de 75 millisecondes, à cause
  d'une trame audio de service comptée comme du son.
- Un quota AWS accordé dans une région pendant que le déploiement visait une
  autre : tout paraissait plafonné sans raison.

Aucun de ces trois n'était visible dans une revue de code. Ils sont sortis d'une
boucle courte entre écrire, mesurer et corriger.

---

# L'état maximal

*Ce que le produit devient si rien ne l'arrête. Les 48 heures en sont une
coupe, pas une ambition réduite.*

## La promesse

**Une chaîne qui se produit toute seule.**

Le créateur ne commande plus une vidéo : il décide d'un sujet, d'un rythme de
publication, et d'un ton. La chaîne tourne sans lui. Il intervient quand il veut
changer quelque chose, pas pour que ça avance.

C'est la seule promesse qui justifie tout le reste — et chaque famille
ci-dessous en est une preuve, pas une fonctionnalité de plus.

## Ce qui la rend vraie

**Le son.** Musique générée pour la scène plutôt que choisie dans une
bibliothèque. Sons par scène. Dialogue à deux voix, pour les formats qui
racontent au lieu d'expliquer.

**L'image qui bouge.** Plans animés, transitions, et un présentateur à l'écran
dont les lèvres suivent la voix. Le passage du diaporama à la vidéo.

**La scénarisation.** Un agent qui écrit, se relit, se critique et réécrit avant
de montrer quoi que ce soit. Des séries : l'épisode 4 sait ce qu'ont dit les
trois premiers. Et le même sujet décliné par plateforme, parce qu'une accroche
qui marche en vertical ne marche pas en horizontal.

**La distribution.** Publication directe sur YouTube et TikTok, à l'heure
choisie.

**La boucle.** La chaîne lit ses propres vues et ajuste l'épisode suivant.
C'est là que « se produit toute seule » cesse d'être une image.

## Ce que ça change pour le client

Aujourd'hui il achète des vidéos. À l'état maximal, il achète une **présence** :
une chaîne qui publie sans lui, dans sa langue, payée en mobile money, pour
moins que le prix d'une seule vidéo montée à la main.

---

## Annexe — trois accroches, à choisir

**A. « Décrivez votre vidéo. Voyez le prix. Payez en mobile money. »**
Trois gestes, trois obstacles levés : la difficulté, l'incertitude, le paiement.
La plus concrète, et la seule qui nomme le mobile money — ce qu'aucun
concurrent ne peut écrire.

**B. « Votre chaîne publie trois fois par semaine. Vous, une fois. »**
Vend le résultat plutôt que l'outil. Plus forte, mais elle promet l'état
maximal, pas les 48 heures.

**C. « Le montage est le travail que personne ne veut faire. »**
Part de la douleur. Bonne pour une publicité, trop lente pour un dossier qu'un
jury parcourt en deux minutes.

Je garde **A** pour la soumission : un jury qui lit vite doit comprendre le
produit à la première ligne, et B promet ce qui n'est pas encore livré.
