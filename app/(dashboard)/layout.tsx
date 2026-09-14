'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Activity, Home, LogOut, Settings, Shield, Wallet } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { Button, ButtonLink } from '@/components/kit/button';
import { Menu, MenuItem, MenuButton } from '@/components/kit/menu';
import { Ancres } from '@/components/kit/ancres';
import { signOut } from '@/app/(login)/actions';
import type { TenantDataWithMembers, User } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/*
 * Une seule barre, à un seul niveau. Sur l'accueil elle porte aussi les
 * ancres de la page. Pas de deuxième bandeau collant sous le premier.
 */
const ANCRES = [
  { id: 'probleme', label: 'Le problème' },
  { id: 'solution', label: 'La solution' },
  { id: 'preuves', label: 'Preuves' },
  { id: 'tarifs', label: 'Tarifs' },
  { id: 'faq', label: 'FAQ' },
];

function Marque() {
  return (
    <Link
      href="/"
      className="group flex min-h-11 shrink-0 items-center gap-2.5"
      aria-label="GenTube — accueil"
    >
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-[6px] border border-line-strong bg-surface-2"
      >
        <svg width="9" height="10" viewBox="0 0 9 10" fill="none">
          <path d="M0 0.5 8.5 5 0 9.5V0.5Z" fill="currentColor" className="text-ink-2" />
        </svg>
      </span>
      <span className="text-[17px] font-bold tracking-tight">
        Gen<span className="text-ink-2">Tube</span>
      </span>
    </Link>
  );
}

function SoldeCredits() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  if (!user) return null;
  const balance = tenant?.creditsBalance;
  return (
    <Link
      href="/dashboard/billing"
      aria-label={`Solde : ${balance ?? 'inconnu'} crédits. Aller à la facturation`}
      className="hidden min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 transition-colors duration-(--t-fast) hover:border-line-strong sm:inline-flex"
    >
      <Wallet className="size-4 text-ink-3" aria-hidden="true" />
      <span className="t-data text-sm font-bold text-ink">
        {balance === undefined ? '—' : balance.toLocaleString('fr-FR')}
      </span>
    </Link>
  );
}

function MenuCompte() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  if (!user) {
    return (
      <ButtonLink href="/sign-up" size="sm">
        Créer ma vidéo
      </ButtonLink>
    );
  }

  const initiales = user.email.slice(0, 2).toUpperCase();

  return (
    <Menu
      label="Menu du compte"
      trigger={
        <span className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-mono text-[11px] font-bold text-ink transition-colors duration-(--t-fast) group-hover:border-ink-3">
          {initiales}
        </span>
      }
    >
      <p className="truncate px-3 py-2 text-xs text-ink-3">{user.email}</p>
      <MenuItem href="/dashboard">
        <Home aria-hidden="true" /> Espace de travail
      </MenuItem>
      <MenuItem href="/dashboard/general">
        <Settings aria-hidden="true" /> Mon compte
      </MenuItem>
      <MenuItem href="/dashboard/security">
        <Shield aria-hidden="true" /> Sécurité
      </MenuItem>
      <MenuItem href="/dashboard/activity">
        <Activity aria-hidden="true" /> Activité
      </MenuItem>
      <form action={handleSignOut} className="mt-1 border-t border-line pt-1">
        <MenuButton type="submit">
          <LogOut aria-hidden="true" /> Se déconnecter
        </MenuButton>
      </form>
    </Menu>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const surAccueil = pathname === '/';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-(--z-header) border-b border-line bg-canvas">
        <div className="mx-auto flex h-(--header-h) w-full max-w-(--content-max) items-center gap-4 px-(--gutter)">
          <Marque />

          {surAccueil && <Ancres ancres={ANCRES} className="hidden min-w-0 flex-1 lg:flex" />}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Suspense fallback={null}>
              <SoldeCredits />
            </Suspense>
            <Suspense fallback={<div className="size-8 rounded-full bg-surface-2" />}>
              <MenuCompte />
            </Suspense>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
