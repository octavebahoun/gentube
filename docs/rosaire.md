# Rosaire — compte et administration

Quatre zones : **facturation, équipe, projets**, et les **15 écrans d'admin**.

Le découpage avec Ahmad est par **zone**, pas par écran : sinon vous éditez le
même composant tous les deux.

## La palette n'est pas négociable

Échantillonnée sur la maquette `docs/fr1.png` :

| Rôle | Valeur |
|---|---|
| Rouge principal | `#CE1F20` |
| Accent | `#E52627` |
| Fond | `#111111` |
| Surface | `#1B1B1B` |

Sombre par défaut. Les tokens sont dans `app/globals.css` — pas de couleur en
dur. Il y en avait 31, elles ont toutes été remplacées.

## La facturation : ce qu'il faut comprendre avant de dessiner

**Deux poches, pas un solde.** Les crédits du plan expirent à la fin du cycle ;
les crédits achetés n'expirent jamais. Un écran qui affiche un seul nombre cache
la seule information qui compte : ce qui va disparaître à la fin du mois.
`tenants.credits_balance` est la somme des deux, dénormalisée — les deux poches
sont `credits_plan` et `credits_topup`.

**En FCFA (XOF), payé en mobile money** via GeniusPay. Pas de centimes, pas de
carte bancaire par défaut.

**Le catalogue est du code**, dans `lib/billing/plans.ts`. Il n'y a pas d'écran
d'admin pour changer les prix, et il n'en faut pas : un prix qui se modifie en
production sans revue est un incident qui attend.

## Les écrans d'admin

Quinze écrans, et ce sont des bonus : rien n'en dépend pour qu'un client
produise une vidéo. Traite-les après facturation, équipe et projets.

Le piège : une partie vient d'un autre projet et **lit Supabase directement**.
Rebrancher les données sur nos server actions est la moitié du travail.

## Le son, en plus des écrans

Deux chantiers, décidés le 28 août 2026 (`docs/providers.md`). Le premier tient
plus de l'opération que du développement, le second est une paire d'écrans.

### Le catalogue d'effets sonores

Environ **150 sons générés une seule fois** avec ElevenLabs Sound Effects, entre
5 et 15 $ en tout, puis servis depuis R2 à coût nul pour toujours.

- **60 effets** : whoosh de transition, impacts, montées, clics d'interface,
  notifications, glitchs, tampons, page tournée, apparition de texte.
- **50 ambiances** : rue, marché, bureau, salle de classe, forêt, pluie, océan,
  vent, foule, voiture, cuisine, nuit.
- **40 nappes musicales** : tension, résolution, curiosité, joie, mélancolie,
  épique, suspense, légèreté.

La table `sound_assets` et le script d'import existent déjà :

```bash
pnpm tsx lib/sounds/import-catalog.ts <catalogue>
```

**Les deux moitiés comptent.** Importer les lignes rend un son *choisissable*
par le LLM qui écrit le storyboard ; le fichier doit atteindre R2 sous la même
clé pour qu'il soit *jouable*. Un son choisissable mais absent de R2 ne casse
pas chez toi, il casse dans Lambda plusieurs minutes plus tard, au milieu d'une
vidéo déjà payée.

Chaque son porte ses pics d'impact en secondes, comme le fait déjà le schéma.

### La musique de fond

`videos.music_url` et `videos.music_volume` existent, le moteur de montage sait
poser une piste. Ce qui manque est le moyen d'en choisir une : un écran de
bibliothèque, et un aperçu.

ElevenLabs Music est retenu pour générer, à environ 0,40 $ la minute, licence
commerciale incluse. La clé ElevenLabs est déjà en place, donc aucun compte
nouveau à ouvrir.

**Où passe la frontière avec Prince.** Choisir une piste dans une bibliothèque
est un écran, donc à toi. Générer un morceau à la demande est un appel
fournisseur, donc une server action à lui demander. Ne l'écris pas toi-même
dans `lib/`, même si c'est tentant : c'est une dépense par appel, et ça se
teste comme les autres fournisseurs.

## Ce que tu ne touches pas

`lib/` — ni la base, ni les migrations, ni les fournisseurs. Il te manque une
server action ? Demande à Prince. Les quotas consommés, en particulier, sont un
calcul sur le grand livre des crédits, et ce calcul est à lui.

À lire d'abord : `docs/tarifs.md` (les deux poches et les marges par plan), puis
`docs/brief-ui.md`.
