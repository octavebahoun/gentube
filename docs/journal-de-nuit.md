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
