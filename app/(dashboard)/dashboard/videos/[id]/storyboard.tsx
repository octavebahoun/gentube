'use client';

import { useEffect, useState } from 'react';
import { useActionState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Mic,
  Trash2,
  Video as VideoIcon,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { creditsForShot } from '@/lib/credits/pricing';
import type { Shot, Video } from '@/lib/db/schema';
import {
  addShotAction,
  deleteVideoAction,
  generateStoryboardAction,
  generateVoiceoverAction,
  reorderShotsAction,
  shotFormAction,
  validateVideoAction,
} from '../actions';

type ActionState = { error?: string; success?: string };

function seconds(value: number) {
  // Une durée mesurée est fractionnaire (5,28 s) ; une estimation rarement.
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} s`;
}

function frenchCredits(value: number) {
  return value.toLocaleString('fr-FR');
}

/**
 * La provenance d'une durée distingue un devis d'un prix : en pointillés
 * tant que c'est lu dans le texte, plein dès que ça vient de l'audio. Même
 * grammaire visuelle que le bandeau de prix, à petite échelle.
 */
function DurationBadge({ shot }: { shot: Shot }) {
  const measured = shot.durationSource === 'measured';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
        measured
          ? 'border-green-500/40 bg-green-500/10 text-green-400'
          : 'border-dashed border-border text-muted-foreground'
      }`}
    >
      {seconds(shot.durationS)} · {measured ? 'mesurée' : 'estimée'}
    </span>
  );
}

/** Coût de la scène, calculé sur la source unique de vérité des prix. */
function ShotCredits({ shot, video }: { shot: Shot; video: Video }) {
  const credits = creditsForShot(shot.durationS, shot.type, video.resolution);
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">
      {frenchCredits(credits)} cr
    </span>
  );
}

function TypeChoice({
  defaultValue,
  idPrefix,
  disabled,
}: {
  defaultValue: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      name="type"
      defaultValue={defaultValue}
      className="flex gap-4"
      disabled={disabled}
    >
      {[
        { value: 'image', label: 'Image fixe', Icon: ImageIcon },
        { value: 'video', label: 'Plan animé', Icon: VideoIcon },
      ].map(({ value, label, Icon }) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`${idPrefix}-${value}`} />
          <Label htmlFor={`${idPrefix}-${value}`} className="gap-1">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * Les clés R2 ne sont pas des URLs : sans route de signature, aucun visuel
 * n'est affichable. Le cadre reste honnête — plein quand la scène a son
 * asset, pointillé sinon.
 */
function VisualFrame({ shot }: { shot: Shot }) {
  const ready = Boolean(shot.assetUrl ?? shot.sourceImageUrl);
  return (
    <div
      className={`flex aspect-video w-full shrink-0 items-center justify-center gap-2 rounded-md lg:w-44 ${
        ready ? 'border border-primary/30' : 'border border-dashed'
      }`}
    >
      <ImageIcon
        className={`h-4 w-4 ${ready ? 'text-primary' : 'text-muted-foreground/60'}`}
      />
      <span
        className={`text-xs ${ready ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}
      >
        {ready ? 'Visuel généré' : 'Pas encore de visuel'}
      </span>
    </div>
  );
}

/**
 * Une scène, un formulaire. Enregistrer et supprimer postent ici et se
 * distinguent par l'`intent` du bouton — HTML interdit les formulaires
 * imbriqués.
 *
 * La durée s'affiche, elle ne se saisit jamais : lue dans la narration tant
 * qu'il n'y a pas d'audio, puis dans l'audio lui-même.
 */
function SortableShotCard({
  shot,
  index,
  editable,
  video,
}: {
  shot: Shot;
  index: number;
  editable: boolean;
  video: Video;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shotFormAction,
    {}
  );
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id, disabled: !editable });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : undefined}
    >
      <Card>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="videoId" value={shot.videoId} />
            <input type="hidden" name="shotId" value={shot.id} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {editable ? (
                  <button
                    type="button"
                    className="cursor-grab touch-none rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    aria-label={`Déplacer la scène ${index + 1}`}
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="size-4" />
                  </button>
                ) : null}
                <span className="text-sm font-medium tabular-nums text-brand-accent">
                  #{String(index + 1).padStart(2, '0')}
                </span>
                <TypeChoice
                  defaultValue={shot.type}
                  idPrefix={`shot-${shot.id}`}
                  disabled={!editable}
                />
                <DurationBadge shot={shot} />
                <ShotCredits shot={shot} video={video} />
              </div>

              {editable && (
                <Button
                  type="submit"
                  name="intent"
                  value="delete"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  aria-label={`Supprimer la scène ${index + 1}`}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-4 lg:flex-row">
              <VisualFrame shot={shot} />

              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <Label htmlFor={`narration-${shot.id}`} className="mb-2">
                    Narration
                  </Label>
                  <Textarea
                    id={`narration-${shot.id}`}
                    name="narration"
                    defaultValue={shot.narration ?? ''}
                    maxLength={2000}
                    disabled={!editable}
                    className="min-h-20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ce que la voix lit. Sa longueur fait la durée de la scène —
                    et le prix. La réécrire efface l&apos;audio déjà enregistré.
                  </p>
                </div>

                <div>
                  <Label htmlFor={`prompt-${shot.id}`} className="mb-2">
                    Prompt visuel
                  </Label>
                  <Textarea
                    id={`prompt-${shot.id}`}
                    name="prompt"
                    defaultValue={shot.prompt}
                    maxLength={1000}
                    disabled={!editable}
                    className="min-h-20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    En anglais : les modèles d&apos;image et de vidéo sont
                    entraînés en anglais.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {editable && (
                <Button
                  type="submit"
                  name="intent"
                  value="save"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Enregistrement…
                    </>
                  ) : (
                    'Enregistrer la scène'
                  )}
                </Button>
              )}
              {state?.error && (
                <p className="text-sm text-red-500">{state.error}</p>
              )}
              {state?.success && (
                <p className="text-sm text-green-600">{state.success}</p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </li>
  );
}

function GenerateButton({
  videoId,
  hasShots,
}: {
  videoId: number;
  hasShots: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateStoryboardAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button
        type="submit"
        variant={hasShots ? 'outline' : 'default'}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Écriture du storyboard…
          </>
        ) : (
          <>
            <Wand2 />
            {hasShots ? 'Réécrire le storyboard' : 'Écrire le storyboard'}
          </>
        )}
      </Button>
      {hasShots && (
        <p className="text-xs text-muted-foreground">
          Réécrire remplace toutes les scènes ci-dessous.
        </p>
      )}
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}

/** Étape deux : enregistrer la voix, et avec elle la durée réelle de chaque scène. */
function VoiceoverForm({ videoId }: { videoId: number }) {
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
            <Loader2 className="animate-spin" />
            Enregistrement de la voix…
          </>
        ) : (
          <>
            <Mic />
            Enregistrer la voix off
          </>
        )}
      </Button>
      <p className="max-w-xl text-xs text-muted-foreground">
        Tant que la voix manque, le prix ci-dessus est une estimation lue dans
        le texte. L&apos;enregistrement mesure chaque scène — ensuite, le
        montant devient ferme.
      </p>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-600">{state.success}</p>
      )}
    </form>
  );
}

function ValidateForm({
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
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    validateVideoAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={isPending || !canAfford}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Débit en cours…
          </>
        ) : (
          <>
            <CheckCircle2 />
            Valider et débiter {frenchCredits(creditsEstimated)} crédits
          </>
        )}
      </Button>
      {!canAfford && (
        <p className="text-sm text-red-500">
          Solde : {frenchCredits(balance)} crédits — il manque{' '}
          {frenchCredits(creditsEstimated - balance)}. Rechargez depuis la page
          facturation.
        </p>
      )}
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-600">{state.success}</p>
      )}
    </form>
  );
}

function AddShotForm({ videoId }: { videoId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addShotAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="videoId" value={videoId} />
      <TypeChoice defaultValue="video" idPrefix="new-shot" />
      <div>
        <Label htmlFor="new-narration" className="mb-2">
          Narration
        </Label>
        <Textarea
          id="new-narration"
          name="narration"
          placeholder="Et pourtant, ce royaume a tenu tête à la France pendant deux ans."
          maxLength={2000}
          required
        />
      </div>
      <div>
        <Label htmlFor="new-prompt" className="mb-2">
          Prompt visuel
        </Label>
        <Textarea
          id="new-prompt"
          name="prompt"
          placeholder="Wide shot of the palace walls at dusk, guards in silhouette."
          maxLength={1000}
          required
        />
      </div>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
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
 * Le bandeau de prix : le seul endroit où l'estimation devient engagement.
 * Pointillés tant que la voix off manque, plein rouge une fois mesuré — la
 * bascule doit se voir, c'est elle qui explique au client pourquoi le prix a
 * bougé.
 */
function PriceStrip({
  credits,
  durationsMeasured,
  spokenSeconds,
  sceneCount,
  resolution,
}: {
  credits: number;
  durationsMeasured: boolean;
  spokenSeconds: number;
  sceneCount: number;
  resolution: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <p className="text-3xl font-semibold tabular-nums">
          {frenchCredits(credits)}
        </p>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
            durationsMeasured
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-dashed border-border text-muted-foreground'
          }`}
        >
          {durationsMeasured ? 'prix ferme' : 'prix estimé'}
        </span>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        {durationsMeasured
          ? 'Mesuré sur la voix off enregistrée — c’est ce montant qui sera débité.'
          : 'Indicatif : lu dans le texte, scène par scène. Enregistrez la voix off pour le verrouiller.'}
      </p>
      <p className="w-full text-xs tabular-nums text-muted-foreground sm:w-auto">
        {seconds(Math.round(spokenSeconds * 10) / 10)} de narration ·{' '}
        {sceneCount} scène{sceneCount === 1 ? '' : 's'} · {resolution}
      </p>
    </div>
  );
}

export function StoryboardEditor({
  video,
  shots,
  creditsEstimated,
  balance,
  canAfford,
  durationsMeasured,
}: {
  video: Video;
  shots: Shot[];
  creditsEstimated: number;
  balance: number;
  canAfford: boolean;
  durationsMeasured: boolean;
}) {
  // Passé `draft`, les crédits sont dépensés et un pipeline tourne sur ces
  // lignes mêmes : le storyboard devient une fiche, plus un formulaire.
  const editable = video.status === 'draft';
  const spokenSeconds = shots.reduce((total, shot) => total + shot.durationS, 0);

  // Ordre optimiste : le glisser déplace tout de suite à l'écran, puis la
  // confirmation serveur revalide la page. En cas de refus, on revient en
  // arrière — les règles restent dans lib/storyboard.
  const [items, setItems] = useState(shots);
  const [reorderError, setReorderError] = useState<string | null>(null);
  useEffect(() => {
    setItems(shots);
  }, [shots]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((shot) => shot.id === active.id);
    const newIndex = items.findIndex((shot) => shot.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setReorderError(null);

    try {
      const formData = new FormData();
      formData.set('videoId', String(video.id));
      formData.set('orderedIds', JSON.stringify(next.map((shot) => shot.id)));
      const result = await reorderShotsAction({}, formData);
      if (result && 'error' in result && result.error) {
        setItems(previous);
        setReorderError(result.error);
      }
    } catch {
      setItems(previous);
      setReorderError("L'ordre n'a pas pu être enregistré. Réessayez.");
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Storyboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PriceStrip
            credits={creditsEstimated}
            durationsMeasured={durationsMeasured}
            spokenSeconds={spokenSeconds}
            sceneCount={items.length}
            resolution={video.resolution}
          />

          {editable &&
            items.length > 0 &&
            (durationsMeasured ? (
              <ValidateForm
                videoId={video.id}
                creditsEstimated={creditsEstimated}
                balance={balance}
                canAfford={canAfford}
              />
            ) : (
              <VoiceoverForm videoId={video.id} />
            ))}

          {!editable && (
            <p className="text-sm text-muted-foreground">
              Cette vidéo est {video.status} — {video.creditsConsumed} crédits
              ont été débités. Le storyboard est en lecture seule à partir
              d&apos;ici.
            </p>
          )}

          {reorderError && (
            <p className="text-sm text-red-500">{reorderError}</p>
          )}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune scène. Faites écrire un premier jet, puis reprenez à la main
            ce que vous voulez.
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((shot) => shot.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-4">
              {items.map((shot, index) => (
                <SortableShotCard
                  key={shot.id}
                  shot={shot}
                  index={index}
                  editable={editable}
                  video={video}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une scène</CardTitle>
          </CardHeader>
          <CardContent>
            <AddShotForm videoId={video.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Suppression d'un brouillon. Refusée par le serveur dès que quelque chose a été facturé. */
export function DeleteVideoButton({
  videoId,
  projectId,
}: {
  videoId: number;
  projectId: number;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteVideoAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" />
            Suppression…
          </>
        ) : (
          <>
            <Trash2 />
            Supprimer ce brouillon
          </>
        )}
      </Button>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
