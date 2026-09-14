'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Film, Loader2, PlusCircle, Users } from 'lucide-react';
import type { TenantDataWithMembers, User } from '@/lib/db/schema';
import { removeTenantMember, inviteTenantMember } from '@/app/(login)/actions';
import { Button, ButtonLink } from '@/components/kit/button';
import { Card, Stat } from '@/components/kit/card';
import { Badge } from '@/components/kit/badge';
import { Field, Input, ChoiceGroup } from '@/components/kit/field';
import { Page, PageHeader, Section, Notice } from '@/components/kit/page';
import { CREDITS_PER_IMAGE, CREDITS_PER_SECOND, imagesAffordable, secondsAffordable } from '@/lib/credits/pricing';

type ActionState = { error?: string; success?: string };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

function Squelette({ hauteur }: { hauteur: string }) {
  return <div className={`pulse-wait rounded-card border border-line bg-surface ${hauteur}`} aria-hidden="true" />;
}

function OffreEtCredits() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Solde crédits" value={balance.toLocaleString('fr-FR')} hint="crédits disponibles" />
        <Stat
          label="Vidéo possible"
          value={formatMinutes(secondsAffordable(balance, 'draft'))}
          hint={`${CREDITS_PER_SECOND.draft} crédits par seconde`}
        />
        <Stat
          label="Images possibles"
          value={imagesAffordable(balance).toLocaleString('fr-FR')}
          hint={`${CREDITS_PER_IMAGE} crédits par image`}
        />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="t-label">Offre en cours</p>
          <p className="mt-1.5 flex items-center gap-3">
            <span className="text-base font-bold capitalize text-ink">{tenant?.plan ?? '—'}</span>
            <Badge tone="neutral">Paiement mobile money XOF</Badge>
          </p>
        </div>
        <ButtonLink href="/dashboard/billing" variant="secondary" size="sm">
          Recharger mes crédits
        </ButtonLink>
      </Card>

      {balance === 0 && (
        <Notice tone="erreur">
          Solde vide. La génération reste bloquée jusqu’à la prochaine recharge.
        </Notice>
      )}
    </div>
  );
}

function Membres() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const { data: currentUser } = useSWR<User>('/api/user', fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<ActionState, FormData>(
    removeTenantMember,
    {}
  );

  const nom = (u: Pick<User, 'id' | 'name' | 'email'>) => u.name || u.email || 'Membre';
  const peutGerer = currentUser?.role !== 'member';

  if (!tenant?.users?.length) {
    return (
      <Section titre="Membres de l’espace">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Users className="size-4" aria-hidden="true" />
          Personne d’autre ici pour l’instant. Invitez quelqu’un ci-dessous.
        </p>
      </Section>
    );
  }

  return (
    <Section
      titre="Membres de l’espace"
      aide={`${tenant.users.length} personne${tenant.users.length > 1 ? 's' : ''} avec accès à cet espace.`}
    >
      <ul className="divide-y divide-line">
        {tenant.users.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-xs font-bold text-ink">
                {nom(member).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{nom(member)}</p>
                <p className="t-label mt-0.5">{member.role}</p>
              </div>
            </div>
            {peutGerer && member.id !== currentUser?.id && (
              <form action={removeAction}>
                <input type="hidden" name="memberId" value={member.id} />
                <Button type="submit" variant="ghost" size="sm" disabled={isRemovePending}>
                  {isRemovePending ? 'Retrait…' : 'Retirer'}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {removeState?.error && (
        <div className="mt-4">
          <Notice tone="erreur">{removeState.error}</Notice>
        </div>
      )}
    </Section>
  );
}

function Inviter() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const peutInviter = user?.role === 'owner' || user?.role === 'admin';
  const [inviteState, inviteAction, isInvitePending] = useActionState<ActionState, FormData>(
    inviteTenantMember,
    {}
  );

  return (
    <Section
      titre="Inviter un collaborateur"
      aide={
        peutInviter
          ? 'La personne reçoit un accès à cet espace et à ses crédits.'
          : 'Seul un propriétaire ou un admin peut inviter.'
      }
    >
      <form action={inviteAction} className="space-y-5">
        <Field
          label="E-mail du collaborateur"
          htmlFor="email"
          hint="L’adresse reçoit l’invitation à rejoindre l’espace."
          error={inviteState?.error}
          required
        >
          <Input
            name="email"
            type="email"
            placeholder="collab@gentube.ai"
            autoComplete="email"
            required
            disabled={!peutInviter}
          />
        </Field>

        <ChoiceGroup
          legend="Rôle d’accès"
          name="role"
          defaultValue="member"
          options={[
            { value: 'member', label: 'Membre', hint: 'Monte les vidéos et corrige les storyboards.' },
            { value: 'admin', label: 'Admin', hint: 'Gère les membres et la facturation.' },
            { value: 'owner', label: 'Propriétaire', hint: 'Contrôle total de l’espace.' },
          ]}
        />

        {inviteState?.success && <Notice tone="ok">{inviteState.success}</Notice>}

        <Button type="submit" variant="secondary" disabled={isInvitePending || !peutInviter}>
          {isInvitePending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Invitation…
            </>
          ) : (
            <>
              <PlusCircle className="size-4" aria-hidden="true" />
              Envoyer l’invitation
            </>
          )}
        </Button>
      </form>
    </Section>
  );
}

export default function EspacePage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Espace de travail"
        titre="Votre studio"
        intro="Vos projets vidéo, votre solde de crédits, l’accès de votre équipe."
        action={
          <ButtonLink href="/dashboard/projects/new" size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouveau projet
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col justify-between gap-4 p-4" interactive>
            <div>
              <p className="t-h3">Un sujet, une vidéo</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                L’assistant écrit le storyboard, fabrique la voix et les images, monte le MP4.
              </p>
            </div>
            <ButtonLink href="/dashboard/projects/new" variant="secondary" size="sm" className="self-start">
              <PlusCircle className="size-4" aria-hidden="true" />
              Créer un projet
            </ButtonLink>
          </Card>

          <Card className="flex flex-col justify-between gap-4 p-4" interactive>
            <div>
              <p className="t-h3">Reprendre le montage</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                Corrigez un storyboard, relancez une voix, téléchargez un rendu terminé.
              </p>
            </div>
            <ButtonLink href="/dashboard/videos" variant="secondary" size="sm" className="self-start">
              <Film className="size-4" aria-hidden="true" />
              Voir mes vidéos
            </ButtonLink>
          </Card>
        </div>

        <Suspense fallback={<Squelette hauteur="h-40" />}>
          <OffreEtCredits />
        </Suspense>
        <Suspense fallback={<Squelette hauteur="h-40" />}>
          <Membres />
        </Suspense>
        <Suspense fallback={<Squelette hauteur="h-64" />}>
          <Inviter />
        </Suspense>
      </div>
    </Page>
  );
}
