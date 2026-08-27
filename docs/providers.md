# Décisions sur les fournisseurs de génération

Arrêtées le 28 août 2026. **Tous les tarifs sont à reconfirmer sur compte avant
d'ouvrir les inscriptions** ; la liste de ce qui reste à vérifier est en fin de
document.

---

## Vidéo — trois modèles sur Replicate

| Modèle | Usage | 480p | 720p | 1080p |
|---|---|---|---|---|
| `wan-video/wan-2.2-i2v-fast` | plans animés muets | 0,05 $ / clip de 5 s | 0,11 $ / clip de 5 s | — |
| `prunaai/p-video` | son synchronisé, dialogue | — | 0,02 $ / s | 0,04 $ / s |
| `prunaai/p-video-avatar` | avatar conteur, lip-sync | — | 0,025 $ / s | 0,045 $ / s |

**Répartition retenue : Wan sur le 480p, p-video sur le 720p.**

Wan est le moins cher en 480p et compte plus de dix millions d'exécutions, ce
qui en fait le modèle le plus éprouvé du catalogue. En 720p l'avantage
s'inverse : 0,11 $ le clip contre 0,10 $ pour p-video sur la même durée.

Wan ne propose pas de 1080p. Le jour où cette résolution sera vendue, seul
p-video pourra la servir.

### Le plancher de cinq secondes

Wan facture **au clip**, pas à la seconde. Une scène de 3 secondes coûte donc
exactement le prix d'une scène de 5, et la différence est perdue sèche.

Le LLM ne doit jamais écrire une scène sous **5 secondes** de narration, soit
environ 70 caractères au ratio de 14 caractères par seconde. La règle se pose
dans le prompt système **et** se fait respecter côté serveur, au même titre que
le type de scène. Le rythme des vidéos n'en souffre pas et la marge est
préservée.

### Les contraintes de p-video

- **10 secondes au maximum** par clip, soit environ 140 caractères de narration.
- **2 personnages au maximum.** Au-delà, la séparation des locuteurs se dégrade
  et une même voix peut porter plusieurs répliques. Un dialogue à trois demande
  un clip par personnage, assemblés au montage.
- Quand un audio est fourni, le paramètre `duration` est ignoré : c'est la durée
  du fichier qui décide. Cela tombe bien, la mesure Edge TTS la connaît déjà.
- Un mode brouillon existe à 0,005 $/s en 720p. Réservé aux essais internes :
  le prix étant fixé avant la génération, un client ne peut pas se voir livrer
  un brouillon.

**Une scène animée dure donc entre 5 et 10 secondes**, et les deux bornes ne
viennent pas du même endroit. Le plancher protège la marge, le plafond est une
limite du modèle.

### Pourquoi pas p-video seul

Un seul modèle serait plus simple à maintenir, et c'est un vrai argument. Mais
Wan est deux fois moins cher sur la résolution par défaut, celle où passera
l'essentiel du volume.

La parade est une couche d'abstraction, `lib/video/provider.ts`, calquée sur le
routage de voix déjà en place (`lib/voice/index.ts`). Elle reçoit la résolution
et le type de plan, elle renvoie le modèle. Le jour où p-video déçoit, on change
une ligne.

### Écartés

**Seedance 1.0**, à 0,03 $/s en 480p, soit trois fois Wan : le plan Starter
tomberait de 22 à 7 minutes. Sa capacité multi-plans avec cohérence narrative
est remarquable, mais elle ferait perdre le contrôle plan par plan et l'édition
du storyboard. À reconsidérer comme option premium, pas comme base.

**Wan 3**, à 0,035 $/s, soit 0,175 $ le clip de 5 s contre 0,05. Meilleure
qualité pour trois fois et demie le prix.

**Ovi**, à 0,2 $ la vidéo, remplacé par p-video-avatar : moins cher en 720p, et
surtout compatible avec la mesure Edge TTS puisqu'il accepte un audio en entrée.

---

## Replicate plutôt que RunPod

Ce que RunPod imposait : une disponibilité aléatoire des GPU en Community Cloud,
environ 150 000 FCFA par mois de coût fixe même sans usage, le déploiement du
modèle, la file, le disque persistant et les démarrages à froid à gérer, un prix
au temps GPU donc imprévisible. Et surtout **un GPU égale un clip à la fois** :
une vidéo de quinze clips prend dix minutes en séquentiel, pendant que le client
suivant attend son tour.

Ce que Replicate donne : des modèles officiels toujours chauds, une facturation
par sortie connue avant de générer, les exécutions échouées non facturées, et
600 créations de prédiction par minute. Les quinze clips d'une vidéo partent en
parallèle sans bloquer les autres clients.

**Seuil de bascule** : environ 5 100 clips par mois, soit 170 par jour, pour
qu'un pod dédié devienne rentable. Cela représente une quinzaine de clients
Starter saturés, et le calcul ne compte ni le temps de maintenance ni la perte
de parallélisme.

### Le piège du solde bas

Replicate réduit progressivement le débit à mesure que le crédit s'épuise, pour
éviter le découvert. Sans moyen de paiement enregistré, la limite tombe à une
requête par seconde.

Cela ne renvoie **aucune erreur claire**. Les générations ralentissent, les
clients attendent, et rien dans les journaux ne l'explique.

Donc : rechargement automatique activé, solde maintenu au-dessus de 20 $. Départ
conseillé à 100 $ avec rechargement automatique déclenché à 30 $.

### Règles d'intégration

- Modèles officiels uniquement, jamais un modèle communautaire dans le chemin
  critique.
- Webhooks systématiques, jamais d'attente bloquante.
- Signature vérifiée avant toute écriture.
- Images d'entrée servies depuis R2 par URL signée.
- Les clips d'une même vidéo partent en parallèle.

---

## Images — Flux conservé

`@cf/black-forest-labs/flux-2-klein-4b` sur Cloudflare Workers AI, à 0,00045 $
l'image en 480p. Sept fois moins cher que la meilleure alternative sur Replicate
(`p-image`, à partir de 0,003 $).

Le défaut constaté ne venait pas du modèle mais des prompts. Une demande de
« mains en prière sur une table » sans mentionner la personne produit des mains
coupées : le modèle ne cadre que ce qu'on nomme.

### Règles de prompt visuel à imposer au LLM

- Décrire le sujet entier avant le cadrage, jamais un membre isolé.
- Nommer explicitement le plan : plan large, plan moyen, gros plan.
- Situer le décor et la lumière en une phrase.
- Éviter les mains détaillées, le texte dans l'image, les foules.
- Un seul sujet principal par plan.
- En anglais, de 20 à 40 mots.

---

## Musique — ElevenLabs

Retenu pour démarrer : une seule clé, une seule facture, licence commerciale
incluse sur tous les plans payants, environ 0,40 $ la minute générée. C'est
aussi le seul du trio à proposer une véritable API développeur, et son catalogue
d'entraînement est sous accord (Merlin, Kobalt), donc la licence la plus propre
du marché.

**Lyria 3 de Google** est à reconsidérer si le volume de musique devient
significatif : 0,04 $ le clip de 30 s et 0,08 $ le morceau complet, soit cinq
fois moins cher. Cela ajoute un compte Google Cloud pour un besoin encore
marginal.

**Suno et Udio sont écartés** : aucune API officielle. Les seuls accès passent
par des enveloppes non officielles qui pilotent des comptes, avec un risque de
coupure et des droits commerciaux flous. Inacceptable pour un SaaS.

---

## Effets sonores — un catalogue fixe

Génération unique avec ElevenLabs Sound Effects, entre 5 et 15 $ en une fois,
puis service depuis R2 à coût nul. Cible : environ **150 sons**.

- **60 effets** : whoosh de transition, impacts, montées, clics d'interface,
  notifications, glitchs, tampons, page tournée, apparition de texte.
- **50 ambiances** : rue, marché, bureau, salle de classe, forêt, pluie, océan,
  vent, foule, voiture, cuisine, nuit.
- **40 nappes musicales** : tension, résolution, curiosité, joie, mélancolie,
  épique, suspense, légèreté.

Chaque son porte ses pics d'impact en secondes, comme le fait déjà `sound_assets`.

### La table `sound_requests`

Le LLM choisit **toujours** un son valide du catalogue : rien ne bloque, rien ne
casse dans Lambda plusieurs minutes plus tard. Mais quand rien ne correspond
vraiment, il enregistre en parallèle ce qu'il aurait voulu, **avec le son de
repli retenu**.

Deux bénéfices. Le catalogue grandit d'après l'usage réel plutôt que d'après des
suppositions, et le couple demande/repli dit si le remplacement était acceptable.

---

## Le coût réel, enregistré en base

Chaque job enregistre **son coût réel au moment de la génération**. La vue de
consommation ne dépend donc d'aucune API de fournisseur, et elle survit à un
changement de fournisseur.

---

## Ce qui reste à vérifier sur compte

1. Le prix de `wan-2.2-i2v-fast` est-il toujours de 0,05 $ le clip ?
2. Ce prix est-il fixe quelle que soit la durée demandée, ou indexé sur le
   nombre d'images ? **Si un clip de 8 s coûte autant qu'un de 5 s, le plancher
   utile monte à 8 secondes.** Cette réponse décide de la règle imposée au LLM.
3. Comparer Wan 2.2 fast et p-video sur la même scène. Quelques centimes
   suffisent à trancher la question de la qualité.

Le quota YouTube, longtemps listé ici comme un plafond, ne l'est plus : voir
`docs/tarifs.md` et le commentaire de `youtube_quota_usage`.
