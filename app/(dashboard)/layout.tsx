'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { CircleIcon, Home, LogOut, Clapperboard, Film, FolderKanban, Wallet } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signOut } from '@/app/(login)/actions';
import { User } from '@/lib/db/schema';
import useSWR, { mutate } from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </Link>
  );
}

function UserMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  if (!user) {
    return (
      <>
        <Link href="/#tarifs" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Tarifs
        </Link>
        <Button render={<Link href="/sign-up" />} className="rounded-full">
          S’inscrire
        </Button>
      </>
    );
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger>
        <Avatar className="cursor-pointer size-9">
          <AvatarImage alt={user.name || ''} />
          <AvatarFallback>
            {user.email
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="flex flex-col gap-1">
        <DropdownMenuItem className="cursor-pointer">
          <Link href="/dashboard" className="flex w-full items-center">
            <Home className="mr-2 h-4 w-4" />
            <span>Tableau de bord</span>
          </Link>
        </DropdownMenuItem>
        <form action={handleSignOut} className="w-full">
          <button type="submit" className="flex w-full">
            <DropdownMenuItem className="w-full flex-1 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Se déconnecter</span>
            </DropdownMenuItem>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthedNav() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  if (!user) return null;
  return (
    <nav className="hidden items-center gap-1 md:flex">
      <NavLink href="/dashboard/projects">
        <span className="inline-flex items-center gap-1.5"><FolderKanban className="size-3.5" /> Projets</span>
      </NavLink>
      <NavLink href="/dashboard/videos">
        <span className="inline-flex items-center gap-1.5"><Film className="size-3.5" /> Vidéos</span>
      </NavLink>
      <NavLink href="/dashboard/fabrication">
        <span className="inline-flex items-center gap-1.5"><Clapperboard className="size-3.5" /> Fabrication</span>
      </NavLink>
      <NavLink href="/dashboard/billing">
        <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> Facturation</span>
      </NavLink>
    </nav>
  );
}

function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center">
          <CircleIcon className="h-6 w-6 text-brand-accent" />
          <span className="ml-2 text-xl font-semibold tracking-tight text-foreground">GenTube</span>
        </Link>
        <Suspense fallback={null}>
          <AuthedNav />
        </Suspense>
        <div className="flex items-center gap-2 sm:gap-4">
          <Suspense fallback={<div className="h-9 w-20" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      {children}
    </section>
  );
}
