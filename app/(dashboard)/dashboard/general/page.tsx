'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { updateAccount } from '@/app/(login)/actions';
import type { User } from '@/lib/db/schema';
import { Button } from '@/components/kit/button';
import { Field, Input } from '@/components/kit/field';
import { Page, PageHeader, Section, Notice } from '@/components/kit/page';
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
      <Field label="Nom" htmlFor="name" hint="Le nom affiché aux autres membres de l'espace." required>
        <Input
          name="name"
          placeholder="Votre nom"
          autoComplete="name"
          defaultValue={state.name || nameValue}
          required
        />
      </Field>
      <Field label="E-mail" htmlFor="email" hint="Sert à vous connecter et à recevoir les notifications." required>
        <Input
          name="email"
          type="email"
          placeholder="vous@exemple.fr"
          autoComplete="email"
          defaultValue={emailValue}
          required
        />
      </Field>
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
    <Page className="max-w-3xl">
      <PageHeader
        eyebrow="Compte"
        titre="Mon compte"
        intro="Votre nom et votre adresse. Le reste des réglages vit dans l'espace de travail."
      />

      <div className="space-y-6">
        <Section titre="Informations du compte">
          <form className="space-y-6" action={formAction}>
            <Suspense fallback={<Champs state={state} />}>
              <ChampsAvecDonnees state={state} />
            </Suspense>

            {state.error && <Notice tone="erreur">{state.error}</Notice>}
            {state.success && <Notice tone="ok">{state.success}</Notice>}

            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Enregistrement…
                </>
              ) : (
                'Enregistrer'
              )}
            </Button>
          </form>
        </Section>

        <Section
          titre="YouTube"
          aide="Publiez vos vidéos directement sur votre chaîne YouTube."
        >
          <YoutubeConnection />
        </Section>
      </div>
    </Page>
  );
}
