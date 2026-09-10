'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { updateAccount } from '@/app/(login)/actions';
import type { User } from '@/lib/db/schema';
import { GxButton } from '@/components/gx/gx-button';
import { GxField, GxInput } from '@/components/gx/gx-field';
import { GxPage, GxPageHeader, GxSection, GxNotice } from '@/components/gx/gx-page';
import { YoutubeConnection } from '@/components/youtube-connection';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ActionState = { name?: string; error?: string; success?: string };

function Champs({
  state,
  nameValue = '',
  emailValue = '',
}: {
  state: ActionState;
  nameValue?: string;
  emailValue?: string;
}) {
  return (
    <>
      <GxField label="Nom" htmlFor="name" hint="Le nom affiché aux autres membres de l'espace." required>
        <GxInput
          name="name"
          placeholder="Votre nom"
          autoComplete="name"
          defaultValue={state.name || nameValue}
          required
        />
      </GxField>
      <GxField label="E-mail" htmlFor="email" hint="Sert à vous connecter et à recevoir les notifications." required>
        <GxInput
          name="email"
          type="email"
          placeholder="vous@exemple.fr"
          autoComplete="email"
          defaultValue={emailValue}
          required
        />
      </GxField>
    </>
  );
}

function ChampsAvecDonnees({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  return <Champs state={state} nameValue={user?.name ?? ''} emailValue={user?.email ?? ''} />;
}

export default function GeneralPage() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(updateAccount, {});

  return (
    <GxPage className="max-w-3xl">
      <GxPageHeader
        eyebrow="Compte"
        titre="Mon compte"
        intro="Votre nom et votre adresse. Le reste des réglages vit dans l'espace de travail."
      />

      <GxSection titre="Informations du compte">
        <form className="space-y-6" action={formAction}>
          <Suspense fallback={<Champs state={state} />}>
            <ChampsAvecDonnees state={state} />
          </Suspense>

          {state.error && <GxNotice tone="erreur">{state.error}</GxNotice>}
          {state.success && <GxNotice tone="ok">{state.success}</GxNotice>}

          <GxButton type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Enregistrement…
              </>
            ) : (
              'Enregistrer'
            )}
          </GxButton>
        </form>
      </GxSection>

      <GxSection
        titre="YouTube"
        aide="Publiez vos vidéos directement sur votre chaîne YouTube."
      >
        <YoutubeConnection />
      </GxSection>
    </GxPage>
  );
}
