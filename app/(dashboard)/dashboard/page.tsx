'use client';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActionState } from 'react';
import { TenantDataWithMembers, User } from '@/lib/db/schema';
import { removeTenantMember, inviteTenantMember } from '@/app/(login)/actions';
import useSWR from 'swr';
import { Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle } from 'lucide-react';
import {
  CREDIT_FCFA,
  CREDITS_PER_IMAGE,
  CREDITS_PER_SECOND,
  imagesAffordable,
  secondsAffordable,
} from '@/lib/credits/pricing';

type ActionState = {
  error?: string;
  success?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function PlanSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Offre et crédits</CardTitle>
      </CardHeader>
    </Card>
  );
}

function formatMinutes(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest}s` : `${minutes} min`;
}

function PlanAndCredits() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? 0;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Offre et crédits</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-medium capitalize">
              Offre : {tenant?.plan ?? '—'}
            </p>
            <p className="text-sm text-muted-foreground">
              Payé en XOF via SasPay —{' '}
              <a href="/dashboard/billing" className="underline">
                gérer l’offre et les crédits
              </a>
              .
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">
              {balance.toLocaleString('fr-FR')}
            </p>
            <p className="text-sm text-muted-foreground">
              crédits ≈ {formatMinutes(secondsAffordable(balance, 'draft'))}{' '}
              en animé Full HD · {imagesAffordable(balance)} images fixes
            </p>
          </div>
        </div>
        {balance === 0 && (
          <p role="alert" className="mt-4 text-sm text-red-500">
            Solde vide — la génération est bloquée jusqu’à la prochaine recharge.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Image fixe : {CREDITS_PER_IMAGE} crédits · vidéo Full HD :{' '}
          {CREDITS_PER_SECOND.draft} crédits/s · Cinéma : {CREDITS_PER_SECOND.standard} crédits/s · 1 crédit = {CREDIT_FCFA} FCFA
        </p>
      </CardContent>
    </Card>
  );
}

function MembersSkeleton() {
  return (
    <Card className="mb-8 h-[140px]">
      <CardHeader>
        <CardTitle>Membres de l’espace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4 mt-1">
          <div className="flex items-center space-x-4">
            <div className="size-8 rounded-full bg-muted"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-muted rounded"></div>
              <div className="h-3 w-14 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Members() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const { data: currentUser } = useSWR<User>('/api/user', fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeTenantMember, {});

  const getUserDisplayName = (user: Pick<User, 'id' | 'name' | 'email'>) =>
    user.name || user.email || 'Unknown User';

  const canManage = currentUser?.role !== 'member';

  if (!tenant?.users?.length) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Membres de l’espace</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aucun membre pour l’instant.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Membres de l’espace</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {tenant.users.map((member) => (
            <li key={member.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarFallback>
                    {getUserDisplayName(member)
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{getUserDisplayName(member)}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {member.role}
                  </p>
                </div>
              </div>
              {canManage && member.id !== currentUser?.id ? (
                <form action={removeAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={isRemovePending}
                  >
                    {isRemovePending ? 'Retrait…' : 'Retirer'}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {removeState?.error && (
          <p className="text-red-500 mt-4">{removeState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteMemberSkeleton() {
  return (
    <Card className="h-[260px]">
      <CardHeader>
        <CardTitle>Inviter un membre</CardTitle>
      </CardHeader>
    </Card>
  );
}

function InviteMember() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const canInvite = user?.role === 'owner' || user?.role === 'admin';
  const [inviteState, inviteAction, isInvitePending] = useActionState<
    ActionState,
    FormData
  >(inviteTenantMember, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inviter un membre</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2">
              E-mail
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="membre@exemple.fr"
              autoComplete="email"
              required
              disabled={!canInvite}
            />
          </div>
          <div>
            <Label>Rôle</Label>
            <RadioGroup
              defaultValue="member"
              name="role"
              className="flex space-x-4"
              disabled={!canInvite}
            >
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="member" id="member" />
                <Label htmlFor="member">Membre</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="admin" id="admin" />
                <Label htmlFor="admin">Admin</Label>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="owner" id="owner" />
                <Label htmlFor="owner">Propriétaire</Label>
              </div>
            </RadioGroup>
          </div>
          {inviteState?.error && (
            <p role="alert" className="text-red-500">{inviteState.error}</p>
          )}
          {inviteState?.success && (
            <p role="status" className="text-green-500">{inviteState.success}</p>
          )}
          <Button
            type="submit"
            disabled={isInvitePending || !canInvite}
          >
            {isInvitePending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Invitation…
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Inviter
              </>
            )}
          </Button>
          {!canInvite && (
            <p className="text-sm text-muted-foreground">
              Seul un propriétaire ou un admin peut inviter.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <section className="shell-gutter mx-auto w-full max-w-(--content-max) flex-1 px-4 py-6 lg:px-8 lg:py-8">
      <p className="text-xs font-medium tracking-widest text-brand-accent uppercase">Espace</p>
      <h1 className="mt-1 mb-6 text-2xl font-semibold tracking-tight">Espace de travail</h1>
      <Suspense fallback={<PlanSkeleton />}>
        <PlanAndCredits />
      </Suspense>
      <Suspense fallback={<MembersSkeleton />}>
        <Members />
      </Suspense>
      <Suspense fallback={<InviteMemberSkeleton />}>
        <InviteMember />
      </Suspense>
    </section>
  );
}
