'use client';

import { useActionState, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/kit/button';
import { Field, Input, Textarea, ChoiceGroup } from '@/components/kit/field';
import { Notice } from '@/components/kit/page';
import { CREDITS_PER_IMAGE, CREDITS_PER_SECOND } from '@/lib/credits/pricing';
import type { Project } from '@/lib/db/schema';
import { createProjectAction, deleteProjectAction, updateProjectAction } from './actions';

type ActionState = { error?: string; success?: string };

/**
 * Les valeurs sont celles que la colonne accepte — lib/projects les vérifie
 * contre l'enum du schéma, donc une dérive casse un test, pas un formulaire.
 * Les libellés, eux, parlent la langue du client : jamais 'image'/'video'.
 */
const PIPELINES = [
  {
    value: 'image',
    label: 'Images fixes',
    hint: `Des images sur une voix off. ${CREDITS_PER_IMAGE} crédits l'image, quelle que soit sa durée à l'écran — c'est le moins cher à la minute.`,
  },
  {
    value: 'video',
    label: 'Plans animés',
    hint: `Des plans qui bougent. ${CREDITS_PER_SECOND.draft} crédits la seconde en Full HD, ${CREDITS_PER_SECOND.standard} en Cinéma.`,
  },
  {
    value: 'mixed',
    label: 'Mixte',
    hint: 'Vous décidez scène par scène dans le storyboard. Le devis suit vos choix.',
  },
] as const;

function ChampsProjet({ project }: { project?: Project }) {
  return (
    <>
      <Field label="Nom du projet" htmlFor="name" required>
        <Input
          name="name"
          placeholder="Histoires du Bénin"
          defaultValue={project?.name ?? ''}
          maxLength={120}
          required
        />
      </Field>

      <ChoiceGroup
        name="defaultPipeline"
        legend="Type de plans par défaut"
        options={PIPELINES}
        defaultValue={project?.defaultPipeline ?? 'mixed'}
        aide="Chaque nouvelle vidéo démarre là-dessus, et peut encore en changer."
      />

      <Field
        label="Style visuel"
        htmlFor="stylePrompt"
        hint="Ajouté devant chaque description de plan : c'est le look que tout le projet partage."
      >
        <Textarea
          name="stylePrompt"
          placeholder="Documentaire cinématographique, lumière dorée chaude, grain 35 mm."
          defaultValue={project?.stylePrompt ?? ''}
          maxLength={2000}
        />
      </Field>

      <Field
        label="Voix"
        htmlFor="voiceId"
        hint="Identifiant de la voix utilisée pour la voix off des vidéos de ce projet."
      >
        <Input
          name="voiceId"
          placeholder="elevenlabs:rachel"
          defaultValue={project?.voiceId ?? ''}
          maxLength={100}
        />
      </Field>

      <Field
        label="Chaîne YouTube"
        htmlFor="youtubeChannelId"
        hint="L'identifiant de la chaîne, collé à la main pour l'instant. La connexion par compte arrive plus tard."
      >
        <Input
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
    <form action={formAction} className="space-y-5">
      <ChampsProjet />
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Création…
          </>
        ) : (
          'Créer le projet'
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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={project.id} />
      <ChampsProjet project={project} />
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
      {state?.success && <Notice tone="ok">{state.success}</Notice>}
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Enregistrement…
          </>
        ) : (
          'Enregistrer les modifications'
        )}
      </Button>
    </form>
  );
}

/**
 * Suppression en deux temps. Le second clic est la confirmation : pas de
 * fenêtre du navigateur à cliquer de travers, et le refus du serveur (un
 * projet qui contient encore des vidéos) s'affiche au même endroit.
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
  const [confirmation, setConfirmation] = useState(false);

  if (!canDelete) {
    return <p className="text-sm text-ink-2">Seul un propriétaire ou un admin peut supprimer un projet.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={projectId} />
      <div className="flex flex-wrap items-center gap-3">
        {confirmation ? (
          <>
            <Button type="submit" variant="danger" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Suppression…
                </>
              ) : (
                'Oui, supprimer définitivement'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmation(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setConfirmation(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Supprimer le projet
          </Button>
        )}
      </div>
      {state?.error && <Notice tone="erreur">{state.error}</Notice>}
    </form>
  );
}
