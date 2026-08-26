'use client';

import { useActionState, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { Project } from '@/lib/db/schema';
import {
  createProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from './actions';

type ActionState = { error?: string; success?: string };

/**
 * Labels for the pipeline choices. The values are the ones the column accepts —
 * lib/projects asserts that list against the schema enum, so a drift breaks a
 * test rather than a form.
 */
const PIPELINE_OPTIONS = [
  {
    value: 'image',
    label: 'Images',
    hint: 'Still frames over a voice-over — cheapest per minute.',
  },
  {
    value: 'video',
    label: 'Video',
    hint: 'Animated clips. 1 credit/s at 480p, 4 at 720p.',
  },
  {
    value: 'mixed',
    label: 'Mixed',
    hint: 'Decided shot by shot in the storyboard.',
  },
] as const;

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2">
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProjectFields({ project }: { project?: Project }) {
  return (
    <>
      <Field label="Name" htmlFor="name">
        <Input
          id="name"
          name="name"
          placeholder="Histoires du Bénin"
          defaultValue={project?.name ?? ''}
          maxLength={120}
          required
        />
      </Field>

      <div>
        <Label>Default pipeline</Label>
        <RadioGroup
          name="defaultPipeline"
          defaultValue={project?.defaultPipeline ?? 'mixed'}
          className="mt-2 space-y-2"
        >
          {PIPELINE_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-start space-x-2">
              <RadioGroupItem
                value={option.value}
                id={`pipeline-${option.value}`}
                className="mt-1"
              />
              <div>
                <Label htmlFor={`pipeline-${option.value}`}>{option.label}</Label>
                <p className="text-xs text-muted-foreground">{option.hint}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
        <p className="mt-2 text-xs text-muted-foreground">
          Every new video starts from this, and can still override it.
        </p>
      </div>

      <Field
        label="Style prompt"
        htmlFor="stylePrompt"
        hint="Prepended to every shot prompt — the look the whole project shares."
      >
        <Textarea
          id="stylePrompt"
          name="stylePrompt"
          placeholder="Cinematic documentary, warm golden light, 35mm film grain."
          defaultValue={project?.stylePrompt ?? ''}
          maxLength={2000}
        />
      </Field>

      <Field
        label="Voice"
        htmlFor="voiceId"
        hint="ElevenLabs voice id. The voice-over step is not wired up yet — this is stored, not used."
      >
        <Input
          id="voiceId"
          name="voiceId"
          placeholder="elevenlabs:rachel"
          defaultValue={project?.voiceId ?? ''}
          maxLength={100}
        />
      </Field>

      <Field
        label="YouTube channel"
        htmlFor="youtubeChannelId"
        hint="Channel id, pasted by hand for now — connecting a channel through OAuth comes later."
      >
        <Input
          id="youtubeChannelId"
          name="youtubeChannelId"
          placeholder="UC…"
          defaultValue={project?.youtubeChannelId ?? ''}
          maxLength={100}
        />
      </Field>
    </>
  );
}

export function NewProjectForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createProjectAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-6">
      <ProjectFields />
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      <Button
        type="submit"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating…
          </>
        ) : (
          'Create project'
        )}
      </Button>
    </form>
  );
}

export function EditProjectForm({ project }: { project: Project }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateProjectAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={project.id} />
      <ProjectFields project={project} />
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
      <Button
        type="submit"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving…
          </>
        ) : (
          'Save changes'
        )}
      </Button>
    </form>
  );
}

/**
 * Two-step delete. The second click is the confirmation, so there is no
 * browser dialog to mis-click through — and the refusal message from the
 * server (a project still holding videos) lands in the same place.
 */
export function DeleteProjectButton({
  projectId,
  canDelete,
}: {
  projectId: number;
  canDelete: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    deleteProjectAction,
    {}
  );
  const [confirming, setConfirming] = useState(false);

  if (!canDelete) {
    return (
      <p className="text-sm text-muted-foreground">
        Only an owner or admin can delete a project.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={projectId} />
      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Confirm deletion'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete project
          </Button>
        )}
      </div>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
