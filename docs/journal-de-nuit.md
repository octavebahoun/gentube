# Journal de la nuit du 1er au 2 septembre 2026

Travail mené seul pendant ton absence. Une entrée par décision, deux ou trois
lignes chacune. Les détails sont dans les commits ; ceci est la liste de ce
que tu dois pouvoir contester au réveil.

---

## Lot 1 — les styles de sous-titres

**`subtitleStyle` était déclaré et jamais lu.** Trois valeurs en base depuis
l'origine, aucune dans la composition : toute vidéo sortait en karaoké, y
compris celles qui avaient choisi autre chose. C'est réparé.

**J'ai resserré le contrat plutôt que de valider à l'exécution.**
`HyperframesStoryboard.subtitleStyle` était typé `string` ; il est maintenant
`SubtitleStyle`. Le compilateur refuse désormais une valeur inventée, ce qu'une
validation au rendu n'aurait attrapé qu'en production.

**`fondant` n'utilise pas de flou.** L'en-tête de `style.css` interdit
`filter: blur()` à cause de la rastérisation logicielle de Lambda. Le mot monte
et se révèle en opacité — même effet perçu, sans le coût.

**Le repli est le karaoké**, pas une erreur. Les vidéos déjà rendues ont eu du
karaoké ; une vidéo dont le style manque doit continuer à ressembler à ce
qu'elle était.

**Le champ n'était réglable nulle part**, et pas seulement dans un écran : ni
`videoInputSchema`, ni aucune route, ni aucun formulaire. Je l'ai ajouté au
schéma d'entrée pour qu'il devienne modifiable par le chemin qui existe déjà.

**Je n'ai pas construit d'écran de réglages.** Aucun n'existe — ni pour le
ratio, ni pour la voix, ni pour la musique. En inventer un pour les sous-titres
seuls serait une décision produit que je n'ai pas à prendre seul. C'est un trou
à part entière, à trancher par toi.

---

## Lot 2 — les transitions sans WebGL

**Six transformations ajoutées**, pas vingt-trois. `push-left`, `push-right`,
`push-up`, `zoom-through`, `zoom-out`, `squeeze` — toutes en transformations
pures, donc justes à coup sûr. J'ai préféré six certaines à vingt-trois
approximatives.

**Les transitions à flou du registre sont écartées**, et ce n'est pas un oubli :
l'en-tête de `style.css` interdit le flou parce que la rastérisation logicielle
de Lambda le paie au triple. Focus Pull et Blur Through en dépendent entièrement.

**J'ai transposé, pas recopié.** Les paquets utilisent `tl.to` sur la scène
sortante ; notre règle impose `fromTo`, seule forme qui survive au saut arrière
du moteur. Un `to` aurait produit une vidéo différente à chaque rendu.

**Une transformation coupe franc pour le compositeur.** Sa couture part avec une
durée nulle : sinon le compositeur de shaders mélange les deux scènes pendant
qu'elles se déplacent, et le geste disparaît sous le fondu.

**Le prompt système n'a rien coûté** : il interpolait déjà `TRANSITIONS`, donc
les six noms y sont entrés seuls. J'y ai ajouté trois lignes sur *quand* choisir
quoi — une liste de vingt-trois noms sans intention produit du hasard.

**Ces transitions animent deux scènes**, celle qui sort et celle qui entre.
C'est la première famille qui touche à la scène précédente ; elle a donc sa
propre liste dans la timeline, parce que la scène `i` n'est pas propriétaire du
mouvement de la scène `i-1`.

**Le défaut que les tests ne voyaient pas.** Le premier rendu montrait une bande
noire pendant chaque poussée : la scène sortante n'était pas là. Trois
diagnostics pour trouver — ce n'était ni le minutage (les deux scènes couvrent
bien l'instant), ni le compositeur de shaders désactivé, mais **`HyperShader.init()`
lui-même**, qui prend la main sur la visibilité et ne garde que la paire de sa
propre couture.

**Le compositeur n'est donc plus installé que si la vidéo demande un shader.**
Conséquence à connaître, et c'est une contrainte produit, pas un détail :
**shaders et transformations ne se mélangent pas dans une même vidéo.** Si un
storyboard contient au moins un shader, ses transformations retombent en coupe
franche.

Je n'ai pas tranché ce que le storyboard doit faire de cette exclusion — refuser
le mélange, ou choisir une famille par vidéo. C'est une règle produit, elle
t'appartient.

**La démo est passée sans shader** pour pouvoir montrer les six mouvements. Elle
ne peut plus montrer les deux familles, par construction. Le rendu à regarder
est `render/demo/amazones-transformations.mp4` ; celui aux shaders reste
`amazones-pageside.mp4`.
