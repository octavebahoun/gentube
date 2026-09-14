'use client';

import { useActionState } from 'react';
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
  generateStoryboardAction,
  generateVisualsAction,
  generateVoiceoverAction,
  monterApportAction,
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

/**
 * Le montage, depuis l'écran.
 *
 * Le bouton attend la fin : une minute de vidéo demande à peu près une minute
 * de machine, et l'action serveur tient la connexion pendant ce temps. C'est
 * fait pour essayer, pas pour servir — la file viendra.
 */
export function RenderForm({ videoId, dejaRendu }: { videoId: number; dejaRendu: boolean }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    renderVideoAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? (
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
        Les images et les voix redescendent sur le disque, la page se compose, et
        le moteur rend le fichier. Comptez à peu près une seconde de machine par
        seconde de vidéo — la page reste ouverte pendant ce temps.
      </p>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
    </form>
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
