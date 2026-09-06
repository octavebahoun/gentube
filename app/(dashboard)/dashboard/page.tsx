'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2, PlusCircle, Users } from 'lucide-react';
import type { TenantDataWithMembers, User } from '@/lib/db/schema';
import { removeTenantMember, inviteTenantMember } from '@/app/(login)/actions';
import { GxButton } from '@/components/gx/gx-button';
import { GxCard, GxStat } from '@/components/gx/gx-card';
import { GxBadge } from '@/components/gx/gx-badge-empty';
import { GxField, GxInput } from '@/components/gx/gx-field';
import { GxPage, GxPageHeader, GxSection, GxNotice, GxRadio } from '@/components/gx/gx-page';
import {
  CREDIT_FCFA,
  CREDITS_PER_IMAGE,
  CREDITS_PER_SECOND,
  imagesAffordable,
  secondsAffordable,
} from '@/lib/credits/pricing';

type ActionState = { error?: string; success?: string };

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function formatMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest}s` : `${minutes} min`;
}

function Squelette({ hauteur }: { hauteur: string }) {
  return <div className={`scan plate ${hauteur}`} aria-hidden="true" />;
}

function OffreEtCredits() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <GxStat
          label="Solde"
          value={balance.toLocaleString('fr-FR')}
          hint="crédits disponibles"
        />
        <GxStat
          label="En Full HD"
          value={formatMinutes(secondsAffordable(balance, 'draft'))}
          hint={`${CREDITS_PER_SECOND.draft} crédits la seconde`}
          tone="cyan"
        />
        <GxStat
          label="En images fixes"
          value={imagesAffordable(balance).toLocaleString('fr-FR')}
          hint={`${CREDITS_PER_IMAGE} crédits l'image`}
          tone="magenta"
        />
      </div>

      <GxCard className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="t-label text-paper-3">Offre en cours</p>
          <p className="mt-2 flex items-center gap-3">
            <span className="font-display text-lg font-bold capitalize">{tenant?.plan ?? '—'}</span>
            <GxBadge tone="cyan">payé en FCFA</GxBadge>
          </p>
        </div>
        <GxButton href="/dashboard/billing" variant="secondary" size="sm">
          Gérer l'offre et les crédits
        </GxButton>
      </GxCard>

      {balance === 0 && (
        <GxNotice tone="erreur">
          Solde vide. La génération reste bloquée jusqu'à la prochaine recharge.
        </GxNotice>
      )}

      <p className="t-data text-xs text-paper-3">
        1 crédit = {CREDIT_FCFA} FCFA · image {CREDITS_PER_IMAGE} cr · Full HD{' '}
        {CREDITS_PER_SECOND.draft} cr/s · Cinéma {CREDITS_PER_SECOND.standard} cr/s
      </p>
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
      <GxSection titre="Membres de l'espace">
        <p className="flex items-center gap-2 text-sm text-paper-3">
          <Users className="size-4" aria-hidden="true" />
          Personne d'autre ici pour l'instant. Invitez quelqu'un ci-dessous.
        </p>
      </GxSection>
    );
  }

  return (
    <GxSection titre="Membres de l'espace" aide={`${tenant.users.length} personne(s) dans cet espace.`}>
      <ul className="divide-y divide-line">
        {tenant.users.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-line-hi bg-ink-3 font-mono text-xs font-bold">
                {nom(member).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{nom(member)}</p>
                <p className="t-label mt-1 text-paper-3">{member.role}</p>
              </div>
            </div>
            {peutGerer && member.id !== currentUser?.id && (
              <form action={removeAction}>
                <input type="hidden" name="memberId" value={member.id} />
                <GxButton type="submit" variant="ghost" size="sm" disabled={isRemovePending}>
                  {isRemovePending ? 'Retrait…' : 'Retirer'}
                </GxButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      {removeState?.error && (
        <div className="mt-4">
          <GxNotice tone="erreur">{removeState.error}</GxNotice>
        </div>
      )}
    </GxSection>
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
    <GxSection
      titre="Inviter quelqu'un"
      aide={
        peutInviter
          ? "La personne reçoit un accès à cet espace et à ses crédits."
          : 'Seul un propriétaire ou un admin peut inviter.'
      }
    >
      <form action={inviteAction} className="space-y-5">
        <GxField
          label="E-mail"
          htmlFor="email"
          hint="L'adresse reçoit l'invitation à rejoindre l'espace."
          error={inviteState?.error}
          required
        >
          <GxInput
            name="email"
            type="email"
            placeholder="membre@exemple.fr"
            autoComplete="email"
            required
            disabled={!peutInviter}
          />
        </GxField>

        <GxRadio
          legend="Rôle"
          name="role"
          defaultValue="member"
          disabled={!peutInviter}
          options={[
            { value: 'member', label: 'Membre' },
            { value: 'admin', label: 'Admin' },
            { value: 'owner', label: 'Propriétaire' },
          ]}
        />

        {inviteState?.success && <GxNotice tone="ok">{inviteState.success}</GxNotice>}

        <GxButton type="submit" disabled={isInvitePending || !peutInviter}>
          {isInvitePending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Invitation…
            </>
          ) : (
            <>
              <PlusCircle className="size-4" aria-hidden="true" />
              Envoyer l'invitation
            </>
          )}
        </GxButton>
      </form>
    </GxSection>
  );
}

export default function EspacePage() {
  return (
    <GxPage>
      <GxPageHeader
        eyebrow="Espace"
        titre="Espace de travail"
        intro="Ce que votre espace peut dépenser, et qui y a accès."
        action={
          <GxButton href="/dashboard/projects/new" size="sm">
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouveau projet
          </GxButton>
        }
      />

      <div className="space-y-6">
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
    </GxPage>
  );
}
