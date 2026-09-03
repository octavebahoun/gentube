# La régression visuelle du moteur

```bash
pnpm test:visual              # compare aux références
npx tsx render/regression/run.ts --update   # les réécrit
```

Trois passes s'ajoutent à la demande, hors du jeu par défaut pour qu'il reste
lançable à chaque changement :

```bash
npx tsx render/regression/run.ts --styles       # un rendu par style de sous-titre
npx tsx render/regression/run.ts --titres       # un rendu par variante de titre
npx tsx render/regression/run.ts --transitions  # un rendu par transition par déplacement
```

`--transitions` ne capture qu'un instant par transition, au milieu de la
troisième coupe : c'est le seul moment où un geste de transition existe.

Ces passes ne sont pas décoratives. Le 3 septembre 2026, `--transitions` a
montré que trois gestes sur vingt-trois — `fold`, `squeeze` et `stretch` —
ne bougeaient pas du tout : le socle du tween posait `scale: 1` à côté du
`scaleX: 0` de la forme, et GSAP écrase l'un par l'autre. Les 496 tests
unitaires étaient verts.

## Pourquoi

Les tests unitaires vérifient qu'un tween est déclaré au bon instant. Ils ne
voient pas qu'une règle CSS l'a rendu invisible.

Les deux erreurs de la nuit du 1er au 2 septembre 2026 sont passées à travers
une suite entièrement verte : la bande noire des poussées, où le compositeur
masquait la scène sortante ; et l'anneau du compteur collé en haut à gauche,
parce que le conteneur et son enfant partageaient une classe. Aucune assertion
ne pouvait les voir. Un œil, oui — et un œil n'est pas là tous les jours.

## Ce qui est figé

Quatre fonds unis et un silence, dans `media/` et `voice/`. Rien n'est généré :
si l'image d'entrée changeait, l'image de sortie changerait, et le test ne
dirait plus rien sur le moteur.

Les durées sont écrites à la main dans `fixtures.ts`, alors qu'en production
elles viennent de la voix off mesurée. Une durée mesurée dépendrait du service
de synthèse, donc du réseau, donc du jour.

Sept instants, un par geste : titre cinétique, fondu, poussée, shader, bandeau,
compteur, carte de fin. Chacun surveille une chose, pour qu'un échec nomme le
coupable plutôt que de dire « la vidéo a changé ».

## Le rendu est forcé en SwiftShader

`--no-browser-gpu`. Un GPU matériel ne rend pas deux fois le même pixel d'une
machine à l'autre : la référence deviendrait un piège. En logiciel, les sept
instants sortent à **1,0000** de similarité, deux passages de suite.

## Le seuil

SSIM à 0,995. Pas une égalité au pixel : l'antialiasing du texte bouge d'une
version de Chrome à l'autre, et un test qui casse à chaque mise à jour finit
désactivé.

Mesuré : un déplacement des sous-titres de 9 % à 16 % de la hauteur fait tomber
les sept instants entre 0,955 et 0,958. La marge est large.

## Ne jamais lancer `--update` sans avoir comparé d'abord

Le 2 septembre 2026, une erreur de syntaxe dans le script de la page a empêché
**toute** la timeline de se charger : plus un sous-titre ne s'allumait. J'ai
régénéré les références au lieu de comparer, et la garde a annoncé « conformes »
sur une composition cassée.

`--update` accepte ce qui est là. Il ne juge rien. Lancez la comparaison, lisez
ce qui a bougé, et seulement ensuite décidez.

Un filet en plus : `npx hyperframes validate render/gentube-v1` lit les erreurs
JavaScript de la page. Une timeline qui ne se charge pas y apparaît en une
ligne, là où les captures ne montrent qu'un rendu bizarrement figé.

## Quand un instant change

La capture fautive est gardée sous `echec-<nom>.png` — ignorée par git.
Regardez-la. Si le changement est voulu, `--update` réécrit les références ;
le diff des PNG dans la revue montrera alors ce que vous avez accepté.
