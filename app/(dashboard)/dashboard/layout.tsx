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
import { GxProgress } from '@/components/gx/gx-progress';

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
        'group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3.5',
        'font-display text-sm font-semibold transition-all duration-200',
        active
          ? 'bg-[#FF7A18]/15 border border-[#FF7A18]/30 text-[#F5F5F5] glow-orange-subtle'
          : 'text-[#A5A7AD] hover:bg-[#171A20] hover:text-[#F5F5F5]'
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[#FF7A18]" />}
      <Icon className={cn('size-4 shrink-0', active ? 'text-[#FF7A18]' : '')} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SoldeRail() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? null;
  const jauge = balance === null ? 0 : Math.min(balance, 2600);

  return (
    <div className="rounded-xl border border-[#292D35] bg-[#111419] p-4 text-[#F5F5F5]">
      <p className="t-label text-xs text-[#A5A7AD]">Solde Crédits</p>
      <p className="t-data mt-2 text-2xl font-bold text-[#FF7A18]">
        {balance === null ? '—' : balance.toLocaleString('fr-FR')}
      </p>
      <GxProgress
        value={jauge}
        max={2600}
        label="Solde de crédits, rapporté à un plan Pro"
        tone="orange"
        className="mt-3"
      />
      <Link
        href="/dashboard/billing"
        className="mt-4 flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-[#FF7A18] px-3 font-display text-xs font-bold text-[#050608] hover:bg-[#FFB45C] transition-all glow-orange-subtle"
      >
        Recharger mes crédits
      </Link>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useSWR<{ id: number; role: string }>('/api/user', fetcher);
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-1 items-stretch bg-[#050608] text-[#F5F5F5]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-pop) focus:rounded-lg focus:bg-[#FF7A18] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-[#050608]"
      >
        Aller au contenu
      </a>

      {/* ── Desktop Studio Sidebar ───────────────────────────────────── */}
      <aside className="sticky top-(--header-h) z-(--z-sidebar) hidden h-[calc(100dvh-var(--header-h))] w-(--sidebar-w) shrink-0 flex-col gap-6 overflow-y-auto border-r border-[#292D35] bg-[#0B0D10] px-3 py-6 lg:flex">
        <nav aria-label="Fabriquer" className="flex flex-col gap-1">
          <p className="t-label px-3 pb-2 text-xs text-[#FF7A18]">Studio Production</p>
          {FABRIQUER.map(({ href, label, Icon }) => (
            <RailLink key={href} href={href} label={label} Icon={Icon} active={isActive(pathname, href)} />
          ))}
        </nav>

        <nav aria-label="Espace et compte" className="flex flex-col gap-1 border-t border-[#292D35] pt-5">
          <p className="t-label px-3 pb-2 text-xs text-[#A855F7]">Espace & Équipe</p>
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

      {/* ── Content Viewport ────────────────────────────────────────── */}
      <main id="contenu" className="bottom-safe min-w-0 flex-1 p-4 lg:p-8">
        {children}
      </main>

      {/* ── Mobile Navigation Bar ───────────────────────────────────── */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-(--z-bottomnav) border-t border-[#292D35] bg-[#0B0D10]/95 backdrop-blur-xl lg:hidden"
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
                    'transition-colors duration-200',
                    active ? 'text-[#FF7A18]' : 'text-[#A5A7AD]'
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 bg-[#FF7A18]" />}
                  <Icon className="size-5" aria-hidden="true" />
                  <span className="t-label text-[0.625rem]">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
