'use client';

import * as React from 'react';
import { ThemeProvider, useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Deux ambiances : la régie (sombre) et le jour (clair).
 * La régie reste la maison — on étalonne dans le noir — mais un écran de
 * bureau en plein soleil n'est pas une salle de montage, d'où le clair.
 * Le choix est retenu d'une visite à l'autre.
 */
export function Ambiance({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="gentube-ambiance"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

export function BoutonAmbiance({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [monte, setMonte] = React.useState(false);

  // Avant l'hydratation, le serveur ne connaît pas le choix stocké : on rend
  // une case de la bonne taille plutôt qu'une icône qui sauterait.
  React.useEffect(() => setMonte(true), []);

  const sombre = resolvedTheme !== 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(sombre ? 'light' : 'dark')}
      aria-label={sombre ? 'Passer en ambiance claire' : 'Passer en ambiance sombre'}
      title={sombre ? 'Ambiance claire' : 'Ambiance sombre'}
      className={cn(
        'inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-line bg-ink-2 text-paper-2',
        'transition-colors duration-(--t-fast) hover:border-cyan hover:text-paper',
        'outline-none focus-visible:outline-2 focus-visible:outline-cyan focus-visible:outline-offset-2',
        className
      )}
    >
      {monte ? (
        sombre ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )
      ) : (
        <span className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
