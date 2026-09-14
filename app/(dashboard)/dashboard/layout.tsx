'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Clapperboard,
  Film,
  FolderKanban,
  Home,
  Settings,
  Shield,
  Wallet,
  Wrench,
} from 'lucide-react';
import useSWR from 'swr';
import type { TenantDataWithMembers } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { ButtonLink } from '@/components/kit/button';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const FABRIQUER = [
  { href: '/dashboard/projects', label: 'Projets', Icon: FolderKanban },
  { href: '/dashboard/videos', label: 'Vidéos', Icon: Film },
  { href: '/dashboard/fabrication', label: 'Fabrication', Icon: Clapperboard },
  { href: '/dashboard/billing', label: 'Crédits', Icon: Wallet },
] as const;

const ESPACE: Array<{
  href: string;
  label: string;
  Icon: typeof Home;
  adminOnly?: boolean;
}> = [
  { href: '/dashboard', label: 'Espace de travail', Icon: Home },
  { href: '/dashboard/general', label: 'Mon compte', Icon: Settings },
  { href: '/dashboard/security', label: 'Sécurité', Icon: Shield },
  { href: '/dashboard/activity', label: 'Activité', Icon: Activity },
  { href: '/dashboard/admin', label: 'Admin', Icon: Wrench, adminOnly: true },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RailLink({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-10 items-center gap-2.5 rounded-control px-3',
        'text-sm font-medium transition-colors duration-(--t-fast)',
        active
          ? 'bg-surface-2 text-ink'
          : 'text-ink-2 hover:bg-surface hover:text-ink'
      )}
    >
      {active && (
        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-ink" />
      )}
      <Icon className={cn('size-4 shrink-0', active ? 'text-ink' : 'text-ink-3')} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SoldeRail() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? null;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="t-label">Solde crédits</p>
      <p className="t-data mt-1 text-xl font-bold text-ink">
        {balance === null ? '—' : balance.toLocaleString('fr-FR')}
      </p>
      <ButtonLink href="/dashboard/billing" variant="secondary" size="sm" className="mt-3 w-full">
        Recharger
      </ButtonLink>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useSWR<{ id: number; role: string }>('/api/user', fetcher);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-1 items-stretch">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-pop) focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-on-brand"
      >
        Aller au contenu
      </a>

      {/* Sidebar desktop */}
      <aside className="sticky top-(--header-h) z-(--z-sidebar) hidden h-[calc(100dvh-var(--header-h))] w-(--sidebar-w) shrink-0 flex-col gap-5 overflow-y-auto border-r border-line px-3 py-5 lg:flex">
        <nav aria-label="Fabriquer" className="flex flex-col gap-0.5">
          <p className="t-label px-3 pb-2">Fabriquer</p>
          {FABRIQUER.map(({ href, label, Icon }) => (
            <RailLink key={href} href={href} label={label} Icon={Icon} active={isActive(pathname, href)} />
          ))}
        </nav>

        <nav aria-label="Espace et compte" className="flex flex-col gap-0.5 border-t border-line pt-4">
          <p className="t-label px-3 pb-2">Espace & compte</p>
          {ESPACE.map(({ href, label, Icon, adminOnly }) => {
            if (adminOnly && !isAdmin) return null;
            return (
              <RailLink key={href} href={href} label={label} Icon={Icon} active={isActive(pathname, href)} />
            );
          })}
        </nav>

        <div className="mt-auto">
          <SoldeRail />
        </div>
      </aside>

      {/* Contenu */}
      <main id="contenu" className="min-w-0 flex-1 pb-24 lg:pb-8">
        {children}
      </main>

      {/* Bottom-nav mobile */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-(--z-bottomnav) border-t border-line bg-canvas lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {FABRIQUER.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
                    'transition-colors duration-(--t-fast)',
                    active ? 'text-ink' : 'text-ink-3'
                  )}
                >
                  {active && (
                    <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 bg-ink" />
                  )}
                  <Icon className="size-5" aria-hidden="true" />
                  <span className="text-[0.625rem] font-semibold tracking-wide uppercase">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
