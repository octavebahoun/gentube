'use client';

import { useActionState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
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
import type { Shot, Video } from '@/lib/db/schema';
import {
  addShotAction,
  deleteVideoAction,
  generateStoryboardAction,
  generateVoiceoverAction,
  shotFormAction,
  validateVideoAction,
} from '../actions';

type ActionState = { error?: string; success?: string };

function seconds(value: number) {
  // Durées mesurées sont fractionnaires (5,28 s) ; les estimations rarement.
  return `${Number.isInteger(value) ? value : value.toFixed(2)}s`;
}

/** La provenance d'une durée est ce qui distingue un devis d'un prix. */
function DurationBadge({ shot }: { shot: Shot }) {
  const measured = shot.durationSource === 'measured';
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium tabular-nums">{seconds(shot.durationS)}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          measured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {measured ? 'measured' : 'estimated'}
      </span>
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
        { value: 'image', label: 'Image', Icon: ImageIcon },
        { value: 'video', label: 'Video', Icon: VideoIcon },
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
 * One scene, one form. Save, delete and the two arrows all post here and are
 * told apart by the `intent` of the button pressed — HTML forbids nested forms,
 * and four separate forms would mean four error slots.
 *
 * The duration is displayed, never typed: it is read off the narration until
 * the voice-over exists, then off the audio itself.
 */
function ShotCard({
  shot,
  index,
  total,
  editable,
}: {
  shot: Shot;
  index: number;
  total: number;
  editable: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    shotFormAction,
    {}
  );

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="videoId" value={shot.videoId} />
          <input type="hidden" name="shotId" value={shot.id} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium tabular-nums text-muted-foreground">
                #{index + 1}
              </span>
              <TypeChoice
                defaultValue={shot.type}
                idPrefix={`shot-${shot.id}`}
                disabled={!editable}
              />
              <DurationBadge shot={shot} />
            </div>

            {editable && (
              <div className="flex items-center gap-1">
                <Button
                  type="submit"
                  name="intent"
                  value="up"
                  variant="ghost"
                  size="sm"
                  disabled={isPending || index === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="down"
                  variant="ghost"
                  size="sm"
                  disabled={isPending || index === total - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="delete"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  aria-label="Delete scene"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            )}
          </div>

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
              What the voice reads. Its length is what the scene lasts — and
              what you are charged for. Rewriting it drops the recorded audio.
            </p>
          </div>

          <div>
            <Label htmlFor={`prompt-${shot.id}`} className="mb-2">
              Visual prompt
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
              In English: the image and video models are trained on English.
            </p>
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save scene'
                )}
              </Button>
            )}
            {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
            {state?.success && (
              <p className="text-sm text-green-600">{state.success}</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
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
        className={
          hasShots ? undefined : 'bg-orange-500 hover:bg-orange-600 text-white'
        }
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Writing the storyboard…
          </>
        ) : (
          <>
            <Wand2 className="mr-2 h-4 w-4" />
            {hasShots ? 'Regenerate' : 'Generate storyboard'}
          </>
        )}
      </Button>
      {hasShots && (
        <p className="text-xs text-muted-foreground">
          Regenerating replaces every scene below.
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
      <Button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 text-white"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Recording the voice…
          </>
        ) : (
          <>
            <Mic className="mr-2 h-4 w-4" />
            Record the voice-over
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        Until the voice exists, the price above is only an estimate read off the
        text. Recording it measures every scene — then the amount is exact.
      </p>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
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
      <Button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 text-white"
        disabled={isPending || !canAfford}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Charging…
          </>
        ) : (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Validate and charge {creditsEstimated.toLocaleString('fr-FR')} credits
          </>
        )}
      </Button>
      {!canAfford && (
        <p className="text-sm text-red-500">
          Balance is {balance.toLocaleString('fr-FR')} credits — short of{' '}
          {(creditsEstimated - balance).toLocaleString('fr-FR')}. Top up from
          the billing page.
        </p>
      )}
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
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
          Visual prompt
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Adding…
          </>
        ) : (
          'Add scene'
        )}
      </Button>
    </form>
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

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Storyboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {creditsEstimated.toLocaleString('fr-FR')}
              </p>
              <p className="text-sm text-muted-foreground">
                credits {durationsMeasured ? 'to pay' : 'estimated'} ·{' '}
                {seconds(Math.round(spokenSeconds * 10) / 10)} of narration in{' '}
                {shots.length} scene{shots.length === 1 ? '' : 's'} at{' '}
                {video.resolution}
              </p>
            </div>
            {editable && (
              <GenerateButton videoId={video.id} hasShots={shots.length > 0} />
            )}
          </div>

          {editable &&
            shots.length > 0 &&
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
              This video is {video.status} — {video.creditsConsumed} credits were
              charged. The storyboard is read-only from here.
            </p>
          )}
        </CardContent>
      </Card>

      {shots.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No scene yet. Generate a first draft, then rewrite what you want.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {shots.map((shot, index) => (
            <li key={shot.id}>
              <ShotCard
                shot={shot}
                index={index}
                total={shots.length}
                editable={editable}
              />
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Add a scene</CardTitle>
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
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Deleting…
          </>
        ) : (
          <>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete this draft
          </>
        )}
      </Button>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
