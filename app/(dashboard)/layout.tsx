'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { Activity, Home, LogOut, Settings, Shield, Wallet } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import { GxButton } from '@/components/gx/gx-button';
import { GxMenu, GxMenuItem, GxMenuButton } from '@/components/gx/gx-menu';
import { BoutonAmbiance } from '@/components/gx/gx-theme';
import { Ancres } from '@/components/gx/gx-ancres';
import { signOut } from '@/app/(login)/actions';
import type { TenantDataWithMembers, User } from '@/lib/db/schema';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/*
 * UNE seule barre, à un seul niveau.
 * Sur l'accueil elle porte aussi les ancres de la page : pas de deuxième
 * bandeau collant sous le premier — deux barres empilées, c'est deux fois
 * trop, et c'est ce qui donne la sensation de flotter.
 */
const ANCRES = [
  { id: 'mur', label: 'Le mur' },
  { id: 'probleme', label: 'Le problème' },
  { id: 'solution', label: 'La solution' },
  { id: 'preuves', label: 'Preuves' },
  { id: 'tarifs', label: 'Tarifs' },
  { id: 'faq', label: 'FAQ' },
];

function Marque() {
  return (
    <Link href="/" className="group flex min-h-11 shrink-0 items-center gap-2.5" aria-label="GenTube — accueil">
      {/* La mire en carré : le logo est la signature du système. */}
      <span
        aria-hidden="true"
        className="mire size-7 rounded-md transition-transform duration-(--t-fast) group-hover:rotate-6"
      />
      <span className="font-display text-lg font-bold tracking-tight">
        Gen<span className="text-marque">Tube</span>
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
      className="hidden min-h-11 items-center gap-2 rounded-pill border border-line bg-ink-2 px-3.5 transition-colors duration-(--t-fast) hover:border-line-hi sm:inline-flex"
    >
      <Wallet className="size-4 text-marque" aria-hidden="true" />
      <span className="t-data text-sm font-bold">
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
      <GxButton href="/sign-up" size="sm">
        Créer ma vidéo
      </GxButton>
    );
  }

  const initiales = user.email.slice(0, 2).toUpperCase();

  return (
    <GxMenu
      label="Menu du compte"
      trigger={
        <span className="flex size-9 items-center justify-center rounded-pill border border-line-hi bg-ink-3 font-mono text-xs font-bold text-paper transition-colors duration-(--t-fast) hover:border-marque">
          {initiales}
        </span>
      }
    >
      <p className="truncate px-3 py-2 text-xs text-paper-3">{user.email}</p>
      <GxMenuItem href="/dashboard">
        <Home aria-hidden="true" /> Espace de travail
      </GxMenuItem>
      <GxMenuItem href="/dashboard/general">
        <Settings aria-hidden="true" /> Mon compte
      </GxMenuItem>
      <GxMenuItem href="/dashboard/security">
        <Shield aria-hidden="true" /> Sécurité
      </GxMenuItem>
      <GxMenuItem href="/dashboard/activity">
        <Activity aria-hidden="true" /> Activité
      </GxMenuItem>
      <form action={handleSignOut} className="mt-1 border-t border-line pt-1">
        <GxMenuButton type="submit">
          <LogOut aria-hidden="true" /> Se déconnecter
        </GxMenuButton>
      </form>
    </GxMenu>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const surAccueil = pathname === '/';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink">
      <header className="sticky top-0 z-(--z-header) border-b border-line bg-ink/85 backdrop-blur-xl">
        <div className="gutter mx-auto flex h-(--header-h) w-full max-w-(--content-max) items-center gap-4">
          <Marque />

          {/* Les ancres vivent ici, dans la même barre. */}
          {surAccueil && <Ancres ancres={ANCRES} className="hidden min-w-0 flex-1 lg:flex" />}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <BoutonAmbiance />
            <Suspense fallback={null}>
              <SoldeCredits />
            </Suspense>
            <Suspense fallback={<div className="size-9 rounded-pill bg-ink-3" />}>
              <MenuCompte />
            </Suspense>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
