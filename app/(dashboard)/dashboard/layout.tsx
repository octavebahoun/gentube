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
} from 'lucide-react';
import useSWR from 'swr';
import type { TenantDataWithMembers } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { GxProgress } from '@/components/gx/gx-progress';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/*
 * Le shell — un seul système de navigation par niveau.
 * ≥1024px : rail gauche (Fabriquer / Espace séparés).
 * <1024px : barre basse, 4 destinations, icône + mot.
 * L'onglet actif porte la mire. C'est le même repère partout dans le produit.
 */
const FABRIQUER = [
  { href: '/dashboard/projects', label: 'Projets', Icon: FolderKanban },
  { href: '/dashboard/videos', label: 'Vidéos', Icon: Film },
  { href: '/dashboard/fabrication', label: 'Fabrication', Icon: Clapperboard },
  { href: '/dashboard/billing', label: 'Crédits', Icon: Wallet },
] as const;

const ESPACE = [
  { href: '/dashboard', label: 'Espace de travail', Icon: Home },
  { href: '/dashboard/general', label: 'Mon compte', Icon: Settings },
  { href: '/dashboard/security', label: 'Sécurité', Icon: Shield },
  { href: '/dashboard/activity', label: 'Activité', Icon: Activity },
] as const;

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
        'group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-lg px-3',
        'font-display text-sm font-semibold transition-colors duration-(--t-fast)',
        active ? 'bg-ink-3 text-paper' : 'text-paper-3 hover:bg-ink-2 hover:text-paper-2'
      )}
    >
      {active && <span aria-hidden="true" className="mire absolute inset-y-0 left-0 w-[3px]" />}
      <Icon className={cn('size-4 shrink-0', active ? 'text-marque' : '')} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SoldeRail() {
  const { data: tenant } = useSWR<TenantDataWithMembers>('/api/tenant', fetcher);
  const balance = tenant?.creditsBalance ?? null;
  // Repère visuel seulement : 2 600 crédits, c'est la dotation Pro d'un mois.
  const jauge = balance === null ? 0 : Math.min(balance, 2600);

  return (
    <div className="plate overflow-hidden p-4">
      <p className="t-label text-paper-3">Solde</p>
      <p className="t-data mt-2 text-2xl font-bold text-marque">
        {balance === null ? '—' : balance.toLocaleString('fr-FR')}
      </p>
      <GxProgress
        value={jauge}
        max={2600}
        label="Solde de crédits, rapporté à une dotation Pro mensuelle"
        className="mt-3"
      />
      <Link
        href="/dashboard/billing"
        className="mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-pill bg-jaune px-3 font-display text-sm font-bold text-ink transition-transform duration-(--t-fast) hover:-translate-y-0.5"
      >
        Recharger
      </Link>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-1 items-stretch">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-pop) focus:rounded-lg focus:bg-jaune focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-ink"
      >
        Aller au contenu
      </a>

      {/* ── Rail desktop ─────────────────────────────────────────────── */}
      <aside className="sticky top-(--header-h) z-(--z-sidebar) hidden h-[calc(100dvh-var(--header-h))] w-(--sidebar-w) shrink-0 flex-col gap-7 overflow-y-auto border-r border-line bg-sidebar px-3 py-6 lg:flex">
        <nav aria-label="Fabriquer" className="flex flex-col gap-1">
          <p className="t-label px-3 pb-3 text-paper-3">Fabriquer</p>
          {FABRIQUER.map(({ href, label, Icon }) => (
            <RailLink key={href} href={href} label={label} Icon={Icon} active={isActive(pathname, href)} />
          ))}
        </nav>

        <nav aria-label="Espace et compte" className="flex flex-col gap-1 border-t border-line pt-5">
          <p className="t-label px-3 pb-3 text-paper-3">Espace</p>
          {ESPACE.map(({ href, label, Icon }) => (
            <RailLink key={href} href={href} label={label} Icon={Icon} active={isActive(pathname, href)} />
          ))}
        </nav>

        <div className="mt-auto">
          <SoldeRail />
        </div>
      </aside>

      {/* ── Contenu ──────────────────────────────────────────────────── */}
      <main id="contenu" className="bottom-safe min-w-0 flex-1">
        {children}
      </main>

      {/* ── Barre basse mobile ───────────────────────────────────────── */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-(--z-bottomnav) border-t border-line bg-ink/95 backdrop-blur-xl lg:hidden"
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
                    active ? 'text-paper' : 'text-paper-3'
                  )}
                >
                  {active && <span aria-hidden="true" className="mire absolute inset-x-3 top-0 h-[3px]" />}
                  <Icon className={cn('size-5', active && 'text-marque')} aria-hidden="true" />
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
