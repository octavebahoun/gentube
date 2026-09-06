'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2, PlusCircle, Users, Film, Clapperboard, Sparkles, FolderKanban } from 'lucide-react';
import type { TenantDataWithMembers, User } from '@/lib/db/schema';
import { removeTenantMember, inviteTenantMember } from '@/app/(login)/actions';
import { GxButton } from '@/components/gx/gx-button';
import { GxCard, GxStat, GxPerfCard } from '@/components/gx/gx-card';
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
  return <div className={`animate-pulse rounded-xl border border-[#292D35] bg-[#111419] ${hauteur}`} aria-hidden="true" />;
}

function ActionsRapides() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <GxPerfCard title="Nouveau Projet IA" timecode="Studio Assistant">
        <div className="space-y-3">
          <p className="text-sm text-[#A5A7AD]">
            Laisse l'assistant IA de GenTube générer le script, la voix, les visuels et le sous-titrage.
          </p>
          <GxButton href="/dashboard/projects/new" variant="primary" glow className="w-full">
            <PlusCircle className="size-4" /> Créer une nouvelle vidéo IA
          </GxButton>
        </div>
      </GxPerfCard>

      <GxPerfCard title="Studio de Montage" timecode="Multi-Tracks Timeline">
        <div className="space-y-3">
          <p className="text-sm text-[#A5A7AD]">
            Reprends l'édition de tes vidéos, ajuste les pistes voix, audio et sous-titres karaoké.
          </p>
          <GxButton href="/dashboard/videos" variant="secondary" className="w-full">
            <Film className="size-4 text-[#FF7A18]" /> Ouvrir la liste des vidéos
          </GxButton>
        </div>
      </GxPerfCard>
    </div>
  );
}

function OffreEtCredits() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <GxStat
          label="Solde Crédits"
          value={balance.toLocaleString('fr-FR')}
          hint="crédits disponibles"
          tone="orange"
        />
        <GxStat
          label="Vidéo Full HD"
          value={formatMinutes(secondsAffordable(balance, 'draft'))}
          hint={`${CREDITS_PER_SECOND.draft} cr / seconde`}
          tone="cyan"
        />
        <GxStat
          label="Visuels Fixes"
          value={imagesAffordable(balance).toLocaleString('fr-FR')}
          hint={`${CREDITS_PER_IMAGE} cr / image`}
          tone="purple"
        />
      </div>

      <GxCard className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="t-label text-[#A5A7AD]">Offre en cours</p>
          <p className="mt-2 flex items-center gap-3">
            <span className="font-display text-lg font-bold capitalize text-[#F5F5F5]">{tenant?.plan ?? '—'}</span>
            <GxBadge tone="orange">Paiement Mobile Money XOF</GxBadge>
          </p>
        </div>
        <GxButton href="/dashboard/billing" variant="primary" size="sm" glow>
          Recharger mes crédits
        </GxButton>
      </GxCard>

      {balance === 0 && (
        <GxNotice tone="erreur">
          Solde vide. La génération IA reste bloquée jusqu'à la prochaine recharge.
        </GxNotice>
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
      <GxSection titre="Membres de l'espace">
        <p className="flex items-center gap-2 text-sm text-[#A5A7AD]">
          <Users className="size-4" aria-hidden="true" />
          Personne d'autre ici pour l'instant. Invitez quelqu'un ci-dessous.
        </p>
      </GxSection>
    );
  }

  return (
    <GxSection titre="Membres du Creative Studio" aide={`${tenant.users.length} personne(s) avec accès à l'espace.`}>
      <ul className="divide-y divide-[#292D35]">
        {tenant.users.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#292D35] bg-[#171A20] font-mono text-xs font-bold text-[#F5F5F5]">
                {nom(member).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#F5F5F5]">{nom(member)}</p>
                <p className="t-label mt-0.5 text-[#A5A7AD]">{member.role}</p>
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
      titre="Inviter un collaborateur"
      aide={
        peutInviter
          ? "La personne reçoit un accès à cet espace et à ses crédits."
          : 'Seul un propriétaire ou un admin peut inviter.'
      }
    >
      <form action={inviteAction} className="space-y-5">
        <GxField
          label="E-mail du collaborateur"
          htmlFor="email"
          hint="L'adresse reçoit l'invitation à rejoindre l'espace."
          error={inviteState?.error}
          required
        >
          <GxInput
            name="email"
            type="email"
            placeholder="collab@gentube.ai"
            autoComplete="email"
            required
            disabled={!peutInviter}
          />
        </GxField>

        <GxRadio
          legend="Rôle d'accès"
          name="role"
          defaultValue="member"
          disabled={!peutInviter}
          options={[
            { value: 'member', label: 'Membre (Monteur)' },
            { value: 'admin', label: 'Admin (Gestionnaire)' },
            { value: 'owner', label: 'Propriétaire' },
          ]}
        />

        {inviteState?.success && <GxNotice tone="ok">{inviteState.success}</GxNotice>}

        <GxButton type="submit" variant="primary" disabled={isInvitePending || !peutInviter}>
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
        eyebrow="Creative Studio"
        titre="Espace de travail GenTube"
        intro="Gère tes projets vidéo IA, le solde de crédits et l'accès de ton équipe."
        action={
          <GxButton href="/dashboard/projects/new" variant="primary" size="sm" glow>
            <PlusCircle className="size-4" aria-hidden="true" />
            Nouveau projet
          </GxButton>
        }
      />

      <div className="space-y-6">
        <ActionsRapides />
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
