'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Scissors,
  Video as VideoIcon,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/kit/button';
import { Select, Textarea } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { cn } from '@/lib/utils';
import {
  addShotAction,
  animateNovitaAction,
  changerVoixAction,
  generateStoryboardAction,
  generateVisualsAction,
  generateVoiceoverAction,
  monterApportAction,
  collectRenderAction,
  renderVideoAction,
  validateVideoAction,
} from '@/app/(dashboard)/dashboard/videos/actions';
import { type ActionState, frenchCredits } from './utils';

function TypeChoice({
  defaultValue,
  idPrefix,
}: {
  defaultValue: string;
  idPrefix: string;
}) {
  return (
    <fieldset className="flex gap-2">
      <legend className="sr-only">Type de plan</legend>
      {[
        { value: 'image', label: 'Image fixe', Icon: ImageIcon },
        { value: 'video', label: 'Plan animé', Icon: VideoIcon },
      ].map(({ value, label, Icon }) => (
        <label
          key={value}
          className={cn(
            'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-sm text-ink-2',
            'transition-colors duration-(--t-fast) hover:border-line-strong',
            'has-checked:border-ink-3 has-checked:bg-surface-2 has-checked:text-ink'
          )}
        >
          <input
            type="radio"
            name="type"
            value={value}
            defaultChecked={defaultValue === value}
            className="size-4 accent-ink"
          />
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function GenerateButton({ videoId, hasShots }: { videoId: number; hasShots: boolean }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateStoryboardAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" variant={hasShots ? 'secondary' : 'primary'} disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Écriture du storyboard…
          </>
        ) : (
          <>
            <Wand2 className="size-4" aria-hidden="true" />
            {hasShots ? 'Réécrire le storyboard' : 'Écrire le storyboard'}
          </>
        )}
      </Button>
      {hasShots && (
        <p className="text-xs text-ink-3">Réécrire remplace toutes les scènes ci-dessous.</p>
      )}
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
    </form>
  );
}

/**
 * Le choix de la voix off. Les options sont celles du plan (Polly sur Starter,
 * ElevenLabs sur Pro) : le serveur les recalcule et refuse tout ce qui n'y est
 * pas, donc un menu forcé ne donne pas accès à une voix premium. On sauve au
 * changement, sans bouton — un réglage, pas un formulaire.
 */
export function VoixForm({
  videoId,
  voix,
  options,
}: {
  videoId: number;
  voix: string | null;
  options: { value: string; label: string }[];
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    changerVoixAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const defaut = options.some((o) => o.value === voix)
    ? (voix as string)
    : options[0]?.value;

  if (options.length === 0) return null;

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <label className="t-label block" htmlFor={`voix-${videoId}`}>
        Voix off
      </label>
      <div className="flex items-center gap-2">
        <Select
          id={`voix-${videoId}`}
          name="voice"
          defaultValue={defaut}
          disabled={isPending}
          onChange={() => formRef.current?.requestSubmit()}
          className="max-w-xs"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {isPending && (
          <Loader2 className="size-4 animate-spin text-ink-3" aria-hidden="true" />
        )}
      </div>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}

/** Étape deux : enregistrer la voix, et avec elle la durée réelle de chaque scène. */
export function VoiceoverForm({ videoId }: { videoId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateVoiceoverAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Enregistrement de la voix…
          </>
        ) : (
          <>
            <Mic className="size-4" aria-hidden="true" />
            Enregistrer la voix off
          </>
        )}
      </Button>
      <p className="max-w-xl text-xs leading-relaxed text-ink-3">
        Tant que la voix manque, le prix ci-dessus est une estimation lue dans le texte.
        L&apos;enregistrement mesure chaque scène — ensuite, le montant devient ferme.
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}

export function ValidateForm({
  videoId,
  creditsEstimated,
  balance,
  canAfford,
}: {
  videoId: number;
  creditsEstimated: number;
  balance: number;
  canAfford: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(validateVideoAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={isPending || !canAfford}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Débit en cours…
          </>
        ) : (
          <>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Valider et débiter {frenchCredits(creditsEstimated)} crédits
          </>
        )}
      </Button>
      {!canAfford && (
        <Notice tone="erreur">
          Solde : {frenchCredits(balance)} crédits — il manque{' '}
          {frenchCredits(creditsEstimated - balance)}. Rechargez depuis la page facturation.
        </Notice>
      )}
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}

/**
 * Étape quatre : les visuels. Les fixes sont dessinées dans la foulée, les
 * clips seulement **lancés** — un plan animé prend une minute chez le
 * fournisseur, et une vidéo en compte une quinzaine. Le bouton rend donc la
 * main avant que les clips existent, et c'est voulu.
 */
export function VisualsForm({
  videoId,
  hasAnimated,
}: {
  videoId: number;
  hasAnimated: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateVisualsAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {hasAnimated ? 'Dessin des images et lancement des clips…' : 'Dessin des images…'}
          </>
        ) : (
          <>
            {hasAnimated ? (
              <VideoIcon className="size-4" aria-hidden="true" />
            ) : (
              <ImageIcon className="size-4" aria-hidden="true" />
            )}
            {hasAnimated ? 'Générer les images et les clips' : 'Générer les images'}
          </>
        )}
      </Button>
      <p className="max-w-xl text-xs leading-relaxed text-ink-3">
        {hasAnimated
          ? 'Chaque scène reçoit d’abord son image fixe — c’est elle que le modèle anime. Les clips partent ensuite chez le fournisseur et arrivent au fil de l’eau : rechargez la page pour suivre.'
          : 'Chaque scène reçoit son image fixe. Rien d’autre à attendre : ce pipeline n’a pas de plan animé.'}
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}

/**
 * Les clips par Novita, pour essayer.
 *
 * À côté du bouton du produit, pas à sa place. Novita s'interroge au lieu de
 * rappeler : le bouton attend chaque clip, une à deux minutes par plan animé.
 * Rien n'est débité.
 */
export function NovitaForm({ videoId, plans }: { videoId: number; plans: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    animateNovitaAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Animation en cours…
          </>
        ) : (
          <>
            <Film className="size-4" aria-hidden="true" />
            Animer par Novita ({plans} plan{plans === 1 ? '' : 's'})
          </>
        )}
      </Button>
      <p className="max-w-xl text-xs leading-relaxed text-ink-3">
        Essai, à côté de Replicate. Novita s&apos;interroge au lieu de rappeler,
        donc le bouton attend&nbsp;: comptez une à deux minutes par plan animé,
        et gardez la page ouverte. Rien n&apos;est débité.
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}

/** Entre deux relevés d'un montage en cours. */
const RELEVE_MS = 5_000;

function appel(action: typeof renderVideoAction, videoId: number) {
  const formData = new FormData();
  formData.set('videoId', String(videoId));
  return action({}, formData) as Promise<ActionState>;
}

/**
 * Le montage, depuis l'écran.
 *
 * Le rendu part sur Lambda et **ne bloque pas** l'action : `renderVideoAction`
 * rend la main dès que l'exécution est lancée, et l'écran relève l'état toutes
 * les cinq secondes jusqu'au fichier. Une action serveur qui attendrait la fin
 * tiendrait la connexion une minute par minute de vidéo.
 *
 * `enCours` permet de reprendre la boucle après un rechargement : le montage
 * continue sur Lambda même si personne ne regarde, mais c'est ce relevé qui
 * descend le fichier sur R2 — sans lui, la vidéo resterait « au montage » avec
 * son MP4 prêt et jamais réclamé.
 */
export function RenderForm({
  videoId,
  dejaRendu,
  enCours = false,
}: {
  videoId: number;
  dejaRendu: boolean;
  enCours?: boolean;
}) {
  const [state, setState] = useState<ActionState>({});
  const [actif, setActif] = useState(enCours);
  const monte = useRef(true);

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const relever = useCallback(async () => {
    const resultat = await appel(collectRenderAction, videoId);
    if (!monte.current) return;
    setState(resultat ?? {});
    // Un succès qui ne dit plus « en cours » est le dernier : le fichier est
    // posé, ou l'erreur est définitive. Dans les deux cas on arrête la boucle.
    if (!resultat?.success || !/en cours/i.test(resultat.success)) {
      setActif(false);
      if (resultat?.success) window.location.reload();
    }
  }, [videoId]);

  useEffect(() => {
    if (!actif) return;
    const minuteur = setInterval(relever, RELEVE_MS);
    void relever();
    return () => clearInterval(minuteur);
  }, [actif, relever]);

  async function lancer() {
    setState({});
    const resultat = await appel(renderVideoAction, videoId);
    if (!monte.current) return;
    setState(resultat ?? {});
    if (!resultat?.error) setActif(true);
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={actif} onClick={lancer}>
        {actif ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Montage en cours…
          </>
        ) : (
          <>
            <Clapperboard className="size-4" aria-hidden="true" />
            {dejaRendu ? 'Refaire le montage' : 'Monter la vidéo'}
          </>
        )}
      </Button>
      <p className="max-w-xl text-xs leading-relaxed text-ink-3">
        Le montage se fait sur nos serveurs. Comptez à peu près deux fois la durée de la vidéo.
        Vous pouvez fermer la page : l'état se reprend au retour.
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </div>
  );
}

export function AddShotForm({ videoId }: { videoId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(addShotAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="videoId" value={videoId} />
      <TypeChoice defaultValue="video" idPrefix="new-shot" />
      <div className="space-y-2">
        <label htmlFor="new-narration" className="text-sm font-medium text-ink">
          Narration
        </label>
        <Textarea
          id="new-narration"
          name="narration"
          placeholder="Et pourtant, ce royaume a tenu tête à la France pendant deux ans."
          maxLength={2000}
          required
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="new-prompt" className="text-sm font-medium text-ink">
          Prompt visuel
        </label>
        <Textarea
          id="new-prompt"
          name="prompt"
          placeholder="Wide shot of the palace walls at dusk, guards in silhouette."
          maxLength={1000}
          required
        />
      </div>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Ajout…
          </>
        ) : (
          'Ajouter la scène'
        )}
      </Button>
    </form>
  );
}

/**
 * Le montage d'une vidéo apportée par le client.
 *
 * **Séparé du sélecteur de fichier des cartes de scène, et pour une raison.**
 * Là-bas, attacher un fichier sert un plan : une capture, une photo de
 * produit. Ici, une vidéo se **découpe** — le montage remplace tous les plans
 * de la vidéo. Un geste destructeur ne partage pas un bouton avec un geste qui
 * ne l'est pas.
 *
 * Le découpage tombe dans les silences de la bande son, dans les bornes de
 * rythme du registre, et alterne le cadrage d'un plan à l'autre : c'est ce
 * recadrage qui rend la coupe visible sur une source continue.
 */
export function ApportForm({
  videoId,
  videos,
  hasShots,
}: {
  videoId: number;
  /** Les vidéos déposées sur le projet. Le composant n'est posé que s'il y en a. */
  videos: { id: number; label: string; words: number }[];
  hasShots: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    monterApportAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          name="assetId"
          defaultValue={String(videos[0]?.id ?? '')}
          disabled={isPending}
          className="min-w-0 flex-1"
        >
          {videos.map((video) => (
            <option key={video.id} value={video.id}>
              {video.label}
              {video.words > 0 ? ` · ${video.words} mots` : ' · non transcrite'}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Découpage…
            </>
          ) : (
            <>
              <Scissors className="size-4" aria-hidden="true" />
              Monter cette vidéo
            </>
          )}
        </Button>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-ink-3">
        Les coupes tombent dans les silences, et le cadrage alterne d&apos;un
        plan à l&apos;autre pour qu&apos;elles se voient.{' '}
        {hasShots
          ? 'Cela remplace toutes les scènes actuelles.'
          : 'Aucune étape payante ne touchera ces plans.'}{' '}
        {videos.every((video) => video.words === 0) &&
          'Sans transcription, la vidéo reste un plan unique : il n’y a aucun silence où couper.'}
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
  );
}
