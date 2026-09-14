'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/kit/button';
import { Field, Input, Textarea, ChoiceGroup } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { CREDITS_PER_IMAGE, CREDITS_PER_SECOND, QUALITY_LABEL } from '@/lib/credits/pricing';
import { createVideoAction } from '../../../../videos/actions';

type ActionState = { error?: string; success?: string };

/*
 * Les deux paliers vendus. Le mot « draft » est la valeur envoyée au serveur ;
 * il ne doit jamais s'afficher — le client lit « Full HD » et « Cinéma ».
 */
const QUALITIES = [
  { value: 'draft', label: QUALITY_LABEL.draft },
  { value: 'standard', label: QUALITY_LABEL.standard },
] as const;

const PIPELINES = [
  { value: 'inherit', label: 'Hériter du projet', hint: 'Le type de plans défini dans les réglages du projet.' },
  { value: 'image', label: 'Images fixes seulement', hint: 'Le moins cher à la minute.' },
  { value: 'video', label: 'Plans animés seulement', hint: 'Chaque scène bouge.' },
  { value: 'mixed', label: 'Images et plans animés (recommandé)', hint: 'Vous décidez scène par scène dans le storyboard.' },
] as const;

export function NewVideoForm({
  projectId,
  projectPipeline,
  allowedQualities,
  watermark,
}: {
  projectId: number;
  projectPipeline: string;
  allowedQualities: readonly string[];
  watermark: boolean;
}) {
  const qualities = QUALITIES.filter((option) => allowedQualities.includes(option.value));
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(createVideoAction, {});

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />

      <Field label="Titre" htmlFor="title" required>
        <Input
          name="title"
          placeholder="Les Amazones du Dahomey"
          maxLength={200}
          required
        />
      </Field>

      <Field
        label="Thème — en quoi la vidéo parle"
        htmlFor="theme"
        hint="Le storyboard est écrit à partir de ce texte. Laissez vide pour utiliser le titre seul."
      >
        <Textarea
          name="theme"
          placeholder="Les guerrières du royaume du Dahomey, de leur fondation à la conquête française."
          maxLength={4000}
        />
      </Field>

      <ChoiceGroup
        name="quality"
        legend="Résolution"
        defaultValue={qualities[0]?.value}
        options={qualities.map((option) => ({
          value: option.value,
          label: option.label,
          hint: `${CREDITS_PER_SECOND[option.value]} crédits/s en animé · ${CREDITS_PER_IMAGE} crédits l'image fixe`,
        }))}
      />

      <ChoiceGroup
        name="pipelineOverride"
        legend="Pipeline"
        defaultValue="inherit"
        options={PIPELINES.map((option) => ({
          value: option.value,
          label:
            option.value === 'inherit' ? `${option.label} (${projectPipeline})` : option.label,
          hint: option.hint,
        }))}
      />

      {state?.error && <Notice tone="erreur">{state.error}</Notice>}

      {watermark ? (
        <p className="rounded-control border border-line bg-surface-2 p-3 text-sm text-ink-2">
          Essai gratuit : la vidéo sortira en 480p avec un filigrane. Un plan actif débloque le
          720p et retire la marque.
        </p>
      ) : (
        <p className="text-xs text-ink-3">
          Le filigrane est décidé au débit, pas au rendu : une vidéo payée en essai gardera sa
          marque même après abonnement.
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Création…
          </>
        ) : (
          'Créer la vidéo'
        )}
      </Button>
    </form>
  );
}
