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
  { value: 'inherit', label: 'Hériter du projet' },
  { value: 'image', label: 'Images fixes seulement' },
  { value: 'video', label: 'Plans animés seulement' },
  { value: 'mixed', label: 'Mixte (recommandé)' },
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
          Titre
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
          Thème — en quoi la vidéo parle
        </Label>
        <Textarea
          id="theme"
          name="theme"
          placeholder="Les guerrières du royaume du Dahomey, de leur fondation à la conquête française."
          maxLength={4000}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Le storyboard est écrit à partir de ce texte. Laissez vide pour
          utiliser le titre seul.
        </p>
      </div>

      <div>
        <Label>Résolution</Label>
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
                  {CREDITS_PER_SECOND.image[option.value]} crédit
                  {CREDITS_PER_SECOND.image[option.value] > 1 ? 's' : ''}/s en
                  fixe · {CREDITS_PER_SECOND.video[option.value]} en animé
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
        <p className="rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-muted-foreground">
          Essai gratuit : la vidéo sortira en 480p avec un filigrane. Un plan
          actif débloque le 720p et retire la marque.
        </p>
      )}
      {!watermark && (
        <p className="text-xs text-muted-foreground">
          Le filigrane est décidé au débit, pas au rendu : une vidéo payée en
          essai gardera sa marque même après abonnement.
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Création…
          </>
        ) : (
          'Créer la vidéo'
        )}
      </Button>
    </form>
  );
}
