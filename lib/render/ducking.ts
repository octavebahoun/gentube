import type { HyperframesScene } from '@/lib/storyboard/render';

/**
 * Le ducking : la musique baisse quand quelqu'un parle.
 *
 * **Pourquoi ce fichier existe.** La fiche d'un registre porte `ducking`
 * depuis le début, et personne ne le lisait : la composition posait un
 * `data-volume` constant sur la piste musique, choisi une fois pour toute la
 * vidéo. Un lit sonore assez bas pour ne pas gêner la voix est aussi assez bas
 * pour ne pas s'entendre là où il n'y a personne — l'ouverture, la fin, un
 * silence voulu. Un lit assez présent pour s'entendre couvre la voix. Une
 * valeur constante ne peut pas être les deux.
 *
 * **Comment le moteur l'entend, et ce n'est pas un attribut.** HyperFrames
 * découvre l'automation de volume en **sondant la page** : il cherche la
 * timeline GSAP pas à pas, lit `element.volume` à chaque pas, et cuit
 * l'enveloppe obtenue dans le WAV de la piste
 * (`discoverAudioVolumeAutomationFromTimeline`, puis
 * `applyVolumeEnvelopeToWav`). Le volume doit donc être **animé**, comme tout
 * le reste de la composition.
 *
 * Il existe bien un attribut `data-keyframes`, et il ne sert pas à ça : il
 * alimente les keyframes d'animation, pas le mixage audio. Écrire l'enveloppe
 * dedans ne lève aucune erreur et ne produit aucun son différent — un
 * non-effet silencieux, la même famille de piège que `result.words` chez
 * Whisper. Vérifié en lisant le moteur, pas sa documentation, qui ne mentionne
 * ni l'un ni l'autre.
 *
 * D'où deux moitiés ici : `enveloppeMusicale()` calcule les points, et
 * `MUSIQUE_JS` les joue sur la timeline.
 */

/**
 * Le temps que met la musique à descendre, et à remonter.
 *
 * Assez long pour qu'on n'entende pas la marche — une descente instantanée
 * fait un clic audible sur un lit continu — et assez court pour que le premier
 * mot ne soit pas couvert. Un tiers de seconde est ce que font les tables de
 * mixage par défaut.
 */
export const RAMPE_SECONDES = 0.35;

/**
 * Le silence en dessous duquel la musique ne remonte pas.
 *
 * **C'est le réglage qui évite le pompage.** Chaque scène est suivie d'une
 * respiration d'une seconde (`POST_NARRATION_PAUSE_SECONDS`) : remonter puis
 * redescendre à chacune ferait respirer la musique six fois dans une vidéo de
 * six plans, ce qui s'entend beaucoup plus qu'un lit qui reste sous la voix.
 *
 * Le seuil est donc **au-dessus** de cette pause : seul un silence voulu — une
 * ouverture, une fin, un blanc écrit — fait remonter le lit.
 */
export const SEUIL_DE_REMONTEE_SECONDES = 1.5;

export type PointDeVolume = { time: number; volume: number };

/** Ce dont l'enveloppe a besoin d'une scène. `HyperframesScene` convient. */
export type ScenePourDucking = Pick<
  HyperframesScene,
  'startInSeconds' | 'narrationSeconds' | 'audioPath' | 'mediaVolume'
>;

/**
 * Les moments où quelque chose se fait entendre.
 *
 * Deux sources, et pas une. La voix off, évidemment — `audioPath`. Mais aussi
 * un plan dont le média porte son propre son : c'est le cas d'usage de la
 * vidéo importée, où la bande son **est** celle du client. Une musique qui ne
 * baisserait pas sous elle se battrait avec elle.
 *
 * La borne est `narrationSeconds` et non `durationInSeconds` : la première est
 * la longueur de l'audio, la seconde comprend la respiration de fin, pendant
 * laquelle plus personne ne parle.
 */
function momentsParles(scenes: ScenePourDucking[]): { debut: number; fin: number }[] {
  return scenes
    .filter((scene) => Boolean(scene.audioPath) || (scene.mediaVolume ?? 0) > 0)
    .map((scene) => ({
      debut: scene.startInSeconds,
      fin: scene.startInSeconds + Math.max(0, scene.narrationSeconds),
    }))
    .filter((moment) => moment.fin > moment.debut)
    .sort((a, b) => a.debut - b.debut);
}

/**
 * Recolle les moments séparés par moins que le seuil.
 *
 * Sans cette fusion, l'enveloppe descendrait et remonterait à chaque scène. On
 * la fait ici plutôt qu'en posant les points, parce qu'un moment fusionné n'a
 * qu'une descente et qu'une remontée — et c'est exactement ce qu'on veut
 * entendre.
 */
function fusionner(
  moments: { debut: number; fin: number }[],
  seuil: number
): { debut: number; fin: number }[] {
  const fusionnes: { debut: number; fin: number }[] = [];

  for (const moment of moments) {
    const precedent = fusionnes[fusionnes.length - 1];
    if (precedent && moment.debut - precedent.fin < seuil) {
      precedent.fin = Math.max(precedent.fin, moment.fin);
    } else {
      fusionnes.push({ ...moment });
    }
  }

  return fusionnes;
}

/**
 * L'enveloppe de la piste musique, en points absolus.
 *
 * Rend un tableau vide quand il n'y a rien à faire : pas de ducking demandé,
 * pas de musique, ou personne qui parle. Un tableau vide veut dire « garde le
 * `data-volume` constant » — et c'est le bon comportement, pas un repli.
 */
export function enveloppeMusicale(
  scenes: ScenePourDucking[],
  {
    volume,
    ducking,
    dureeTotale,
    rampe = RAMPE_SECONDES,
    seuil = SEUIL_DE_REMONTEE_SECONDES,
  }: {
    volume: number;
    ducking: number;
    dureeTotale: number;
    rampe?: number;
    seuil?: number;
  }
): PointDeVolume[] {
  if (!(ducking > 0) || !(volume > 0)) return [];

  const moments = fusionner(momentsParles(scenes), seuil);
  if (moments.length === 0) return [];

  const haut = volume;
  const bas = Math.max(0, volume * (1 - Math.min(1, ducking)));
  const borner = (t: number) => Math.min(dureeTotale, Math.max(0, t));
  const arrondi = (t: number) => Math.round(t * 1000) / 1000;

  const points: PointDeVolume[] = [];

  /*
   * Deux points au même instant, ça arrive : une voix qui commence à zéro met
   * sa rampe et sa descente au même endroit, une fois bornées. Le dernier
   * écrit gagne — c'est aussi ce que HyperFrames fait de son côté, donc
   * collapser ici ne change pas le son ; ça rend seulement l'attribut plus
   * court et lisible à l'œil.
   */
  const pousser = (time: number, volume: number) => {
    const t = arrondi(borner(time));
    const dernier = points[points.length - 1];
    if (dernier && dernier.time === t) {
      dernier.volume = volume;
      return;
    }
    points.push({ time: t, volume });
  };

  // Le lit est en haut avant le premier mot — sauf si le premier mot tombe
  // dès la première image : il n'y a alors rien à descendre depuis.
  if (moments[0].debut - rampe > 0) pousser(0, haut);

  for (const moment of moments) {
    pousser(moment.debut - rampe, haut);
    pousser(moment.debut, bas);
    pousser(moment.fin, bas);
    pousser(moment.fin + rampe, haut);
  }

  return points;
}

/**
 * Le script qui joue l'enveloppe, transporté en chaîne comme les autres.
 *
 * **Un seul tween, et sur un objet porteur.** Une suite de `fromTo` sur la
 * même propriété du même élément se battrait : chacun applique son état de
 * départ dès la construction de la timeline, et le dernier écrit gagne — c'est
 * exactement le défaut qui mettait les treize lignes de sous-titre à l'écran
 * dès la première image. Ici, un unique `fromTo` promène un temps de zéro à la
 * fin, et son `onUpdate` calcule le volume. Rien à quoi se disputer.
 *
 * Le même patron que le compteur de `contenus.ts` : un objet porteur, un
 * `fromTo` absolu, et l'écriture dans le DOM depuis `onUpdate`.
 *
 * `ease: "none"` parce que le temps doit avancer à la vitesse du temps :
 * n'importe quelle autre courbe déplacerait les points de l'enveloppe.
 *
 * ATTENTION : pas d'accent grave dans ce fichier de chaîne.
 */
export const MUSIQUE_JS = `
      if (T.musicEnvelope && T.musicEnvelope.length > 0) {
        const piste = document.getElementById("music");
        const points = T.musicEnvelope;
        const horloge = { t: 0 };

        // Le volume a un instant, interpole entre les deux points qui
        // l entourent. Avant le premier et apres le dernier, on tient la
        // valeur du bord : l enveloppe ne dit rien de plus.
        const volumeA = function (t) {
          if (t <= points[0].time) return points[0].volume;
          for (let i = 1; i < points.length; i += 1) {
            if (t <= points[i].time) {
              const a = points[i - 1];
              const b = points[i];
              const span = b.time - a.time;
              if (span <= 0) return b.volume;
              return a.volume + (b.volume - a.volume) * ((t - a.time) / span);
            }
          }
          return points[points.length - 1].volume;
        };

        if (piste) {
          piste.volume = volumeA(0);
          tl.fromTo(
            horloge,
            { t: 0 },
            {
              t: T.musicDuration,
              duration: T.musicDuration,
              ease: "none",
              onUpdate: function () {
                piste.volume = volumeA(horloge.t);
              },
            },
            0
          );
        }
      }
`;
