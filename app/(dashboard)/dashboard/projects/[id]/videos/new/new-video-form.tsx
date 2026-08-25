'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { CREDITS_PER_SECOND } from '@/lib/credits/pricing';
import { createVideoAction } from '../../../../videos/actions';

type ActionState = { error?: string; success?: string };

const RESOLUTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
] as const;

const PIPELINES = [
  { value: 'inherit', label: 'Inherit from the project' },
  { value: 'image', label: 'Images only' },
  { value: 'video', label: 'Video only' },
  { value: 'mixed', label: 'Mixed' },
] as const;

export function NewVideoForm({
  projectId,
  projectPipeline,
  allowedResolutions,
  watermark,
}: {
  projectId: number;
  projectPipeline: string;
  allowedResolutions: readonly string[];
  watermark: boolean;
}) {
  const resolutions = RESOLUTIONS.filter((option) =>
    allowedResolutions.includes(option.value)
  );
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createVideoAction,
    {}
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />

      <div>
        <Label htmlFor="title" className="mb-2">
          Title
        </Label>
        <Input
          id="title"
          name="title"
          placeholder="Les Amazones du Dahomey"
          maxLength={200}
          required
        />
      </div>

      <div>
        <Label htmlFor="theme" className="mb-2">
          Theme
        </Label>
        <Textarea
          id="theme"
          name="theme"
          placeholder="The women warriors of the kingdom of Dahomey, from their founding to the French conquest."
          maxLength={4000}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          What the storyboard is written from. Left empty, the title is used
          instead.
        </p>
      </div>

      <div>
        <Label>Resolution</Label>
        <RadioGroup name="resolution" defaultValue="480p" className="mt-2 space-y-2">
          {resolutions.map((option) => (
            <div key={option.value} className="flex items-start gap-2">
              <RadioGroupItem
                value={option.value}
                id={`resolution-${option.value}`}
                className="mt-1"
              />
              <div>
                <Label htmlFor={`resolution-${option.value}`}>{option.label}</Label>
                <p className="text-xs text-muted-foreground">
                  {CREDITS_PER_SECOND.image[option.value]} credit
                  {CREDITS_PER_SECOND.image[option.value] > 1 ? 's' : ''}/s for a
                  still · {CREDITS_PER_SECOND.video[option.value]} for an animated
                  shot
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label>Pipeline</Label>
        <RadioGroup
          name="pipelineOverride"
          defaultValue="inherit"
          className="mt-2 space-y-2"
        >
          {PIPELINES.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem
                value={option.value}
                id={`pipeline-${option.value}`}
              />
              <Label htmlFor={`pipeline-${option.value}`}>
                {option.label}
                {option.value === 'inherit' && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({projectPipeline})
                  </span>
                )}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      {watermark && (
        <p className="rounded-md border border-orange-500/20 bg-orange-500/10 p-3 text-sm text-muted-foreground">
          Essai gratuit : la vidéo sortira en 480p avec un filigrane. Un plan
          actif débloque le 720p et retire la marque.
        </p>
      )}
      <Button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 text-white"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating…
          </>
        ) : (
          'Create video'
        )}
      </Button>
    </form>
  );
}
