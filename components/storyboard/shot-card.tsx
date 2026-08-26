'use client';

import { useActionState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Image as ImageIcon, Loader2, Trash2, Video as VideoIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { creditsForShot } from '@/lib/credits/pricing';
import type { Shot, Video } from '@/lib/db/schema';
import { shotFormAction } from '@/app/(dashboard)/dashboard/videos/actions';
import { type ActionState, frenchCredits, seconds } from './utils';

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
    <RadioGroup name="type" defaultValue={defaultValue} className="flex gap-4" disabled={disabled}>
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
      <ImageIcon className={`h-4 w-4 ${ready ? 'text-primary' : 'text-muted-foreground/60'}`} />
      <span className={`text-xs ${ready ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
        {ready ? 'Visuel généré' : 'Pas encore de visuel'}
      </span>
    </div>
  );
}

/**
 * Une scène, un formulaire. Enregistrer et supprimer postent ici et se
 * distinguent par l'`intent` du bouton — HTML interdit les formulaires
 * imbriqués. La durée s'affiche, elle ne se saisit jamais.
 */
export function SortableShotCard({
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
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(shotFormAction, {});
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shot.id,
    disabled: !editable,
  });

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
                <TypeChoice defaultValue={shot.type} idPrefix={`shot-${shot.id}`} disabled={!editable} />
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
                    Ce que la voix lit. Sa longueur fait la durée de la scène — et le prix. La réécrire
                    efface l&apos;audio déjà enregistré.
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
                    En anglais : les modèles d&apos;image et de vidéo sont entraînés en anglais.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {editable && (
                <Button type="submit" name="intent" value="save" variant="outline" size="sm" disabled={isPending}>
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
              {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
              {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
            </div>
          </form>
        </CardContent>
      </Card>
    </li>
  );
}
