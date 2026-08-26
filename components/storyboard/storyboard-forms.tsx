'use client';

import { useActionState } from 'react';
import { CheckCircle2, Image as ImageIcon, Loader2, Mic, Video as VideoIcon, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  addShotAction,
  generateStoryboardAction,
  generateVoiceoverAction,
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
    <RadioGroup name="type" defaultValue={defaultValue} className="flex gap-4">
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

export function GenerateButton({ videoId, hasShots }: { videoId: number; hasShots: boolean }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateStoryboardAction,
    {}
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" variant={hasShots ? 'outline' : 'default'} disabled={isPending}>
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
      {hasShots && <p className="text-xs text-muted-foreground">Réécrire remplace toutes les scènes ci-dessous.</p>}
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
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
        Tant que la voix manque, le prix ci-dessus est une estimation lue dans le texte.
        L&apos;enregistrement mesure chaque scène — ensuite, le montant devient ferme.
      </p>
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
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
          Solde : {frenchCredits(balance)} crédits — il manque {frenchCredits(creditsEstimated - balance)}.
          Rechargez depuis la page facturation.
        </p>
      )}
      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">{state.success}</p>}
    </form>
  );
}

export function AddShotForm({ videoId }: { videoId: number }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(addShotAction, {});
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
