import type { WordTiming } from '@/lib/transcribe/whisper';
import { ficheRythme } from './registres';

/**
 * Découpe une vidéo apportée par le client en plans.
 *
 * **Pourquoi ça existe.** Un import de trente secondes était un plan unique :
 * on lui posait des sous-titres au-dessus et c'était tout. Pas de transition,
 * pas de zoom, aucun rythme — le montage n'avait rien à monter. La raison
 * qu'on s'en donnait était fausse : `data-media-start` existe, plusieurs plans
 * peuvent entrer dans le même fichier à des endroits différents.
 *
 * **Où couper.** Dans un silence, jamais à intervalle fixe. Une coupe au
 * milieu d'un mot est la seule chose qui se lise franchement comme une erreur ;
 * une coupe deux secondes plus tôt ou plus tard ne s'entend pas. On cherche
 * donc, dans la fenêtre que le registre autorise, le plus grand blanc entre
 * deux mots — et on coupe là.
 *
 * **Ce que ça ne fait pas.** Aucune décision d'image : le zoom, la transition
 * et le mouvement de caméra restent l'affaire de `habille()`, à qui l'on donne
 * la place de chaque plan. Ce fichier ne dit que « où entrer dans le fichier,
 * combien de temps, et quels mots ».
 */

/** Un plan taillé dans le fichier du client. */
export type PlanDecoupe = {
  /** Où entrer dans le fichier, en secondes. C'est `render.mediaStart`. */
  mediaStart: number;
  /** Combien de temps ce plan tient à l'écran. */
  durationS: number;
  /**
   * Les mots de ce plan, **relatifs à son début**.
   *
   * C'est le contrat que la composition attend : `plan.ts` ajoute
   * `scene.startInSeconds` à chaque mot. Les garder absolus mettrait tous les
   * sous-titres du second plan hors de sa fenêtre, et ils ne s'afficheraient
   * jamais.
   */
  words: WordTiming[];
};

/**
 * Les blancs entre deux mots consécutifs.
 *
 * Le blanc après le mot `i` va de sa fin au début du mot suivant. Il peut être
 * négatif — un fournisseur de transcription fait déborder une fin sur le mot
 * d'après — et un blanc négatif n'est pas un endroit où couper.
 */
function blancApres(mots: WordTiming[], i: number): number {
  const courant = mots[i];
  const suivant = mots[i + 1];
  if (!suivant) return Number.POSITIVE_INFINITY;
  return suivant.start - (courant.start + courant.duration);
}

/**
 * L'index du mot après lequel couper, depuis `depuis`.
 *
 * Rend `null` quand il ne reste plus assez de matière pour un plan entier : le
 * reste part alors dans le plan courant, plutôt que de fabriquer un plan trop
 * court en fin de vidéo.
 *
 * **Le choix se fait sur le blanc, pas sur la durée.** Tous les candidats de la
 * fenêtre sont acceptables par construction ; entre deux acceptables, celui qui
 * tombe dans le plus grand silence s'entend le moins.
 */
function couperApres(
  mots: WordTiming[],
  depuis: number,
  debutDuPlan: number,
  { min, max }: { min: number; max: number }
): number | null {
  let meilleur: { index: number; blanc: number } | null = null;
  let dernierDansLaFenetre: number | null = null;

  for (let i = depuis; i < mots.length - 1; i += 1) {
    const finDuPlan = mots[i].start + mots[i].duration - debutDuPlan;
    if (finDuPlan < min) continue;
    if (finDuPlan > max) break;

    dernierDansLaFenetre = i;
    const blanc = blancApres(mots, i);
    if (!meilleur || blanc > meilleur.blanc) meilleur = { index: i, blanc };
  }

  if (meilleur) return meilleur.index;

  /*
   * Aucun candidat dans la fenêtre : ça arrive sur un débit continu sans
   * respiration, où le premier mot qui dépasse `min` dépasse déjà `max`. On
   * coupe alors au dernier mot avant le plafond plutôt que de laisser un plan
   * plus long que ce que le registre autorise.
   */
  if (dernierDansLaFenetre !== null) return dernierDansLaFenetre;

  for (let i = depuis; i < mots.length - 1; i += 1) {
    if (mots[i].start + mots[i].duration - debutDuPlan >= min) return i;
  }
  return null;
}

/**
 * Taille les plans d'un import.
 *
 * `dureeMedia` est la longueur réelle du fichier : le dernier plan va jusque
 * là, pour ne pas perdre les dernières images ni couper la bande son sur un
 * mot. Un transcript vide rend un plan unique — il n'y a aucun silence où
 * couper, et découper à l'aveugle vaudrait moins qu'un plan franc.
 */
export function decouperLimport(
  mots: WordTiming[],
  dureeMedia: number,
  registre?: string
): PlanDecoupe[] {
  const { min, max } = ficheRythme(registre);

  const plan = (mediaStart: number, fin: number, dedans: WordTiming[]) => ({
    mediaStart: Math.round(mediaStart * 1000) / 1000,
    durationS: Math.round((fin - mediaStart) * 1000) / 1000,
    words: dedans.map((mot) => ({
      ...mot,
      start: Math.round((mot.start - mediaStart) * 1000) / 1000,
    })),
  });

  if (mots.length === 0 || dureeMedia <= max) {
    return [plan(0, dureeMedia, mots)];
  }

  const plans: PlanDecoupe[] = [];
  let debut = 0;
  let premierMot = 0;

  while (premierMot < mots.length) {
    const coupe = couperApres(mots, premierMot, debut, { min, max });
    if (coupe === null) break;

    /*
     * La coupe tombe dans le blanc, au milieu.
     *
     * Ni sur la fin du mot — la queue de la syllabe serait rognée — ni sur le
     * début du suivant, qui commencerait alors sur une attaque. Le milieu du
     * silence laisse une marge des deux côtés.
     */
    const blanc = blancApres(mots, coupe);
    const finDuMot = mots[coupe].start + mots[coupe].duration;
    const fin = blanc > 0 ? finDuMot + blanc / 2 : finDuMot;

    plans.push(plan(debut, fin, mots.slice(premierMot, coupe + 1)));
    debut = fin;
    premierMot = coupe + 1;
  }

  /*
   * Le reste, jusqu'au bout du fichier : ni images ni mots perdus.
   *
   * Mais pas à n'importe quel prix. Une coupe peut tomber à 29,2 s d'un
   * fichier de 30 s : le reste fait alors huit dixièmes de seconde, que le
   * plancher du moteur remonte à une seconde — un plan qui passe en un éclair
   * et se lit comme une erreur de montage. Sous la borne basse du registre, le
   * reste rejoint donc le plan précédent.
   *
   * Le plan élargi peut dépasser le plafond du rythme, et c'est le bon
   * échange : une seconde de trop ne s'entend pas, un plan d'une seconde se
   * voit.
   */
  const restant = dureeMedia - debut;
  const dernier = plans[plans.length - 1];

  if (dernier && restant < min) {
    plans[plans.length - 1] = plan(dernier.mediaStart, dureeMedia, [
      ...dernier.words.map((mot) => ({
        ...mot,
        start: mot.start + dernier.mediaStart,
      })),
      ...mots.slice(premierMot),
    ]);
    return plans;
  }

  plans.push(plan(debut, dureeMedia, mots.slice(premierMot)));
  return plans;
}
