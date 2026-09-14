import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter_Tight } from 'next/font/google';
import { getUser, getTenantForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

export const metadata: Metadata = {
  title: 'GenTube — Décrivez. On monte.',
  description:
    'Vous décrivez un sujet, GenTube rend un MP4 monté : voix française, images, sous-titres karaoké et musique. Essai gratuit, paiement mobile money en FCFA.'
};

export const viewport: Viewport = {
  themeColor: '#0d0d10',
  maximumScale: 5
};

/*
 * Inter Tight ne sert qu'à la landing, où le poids n'a pas d'importance.
 * preload: false — l'application ne télécharge jamais cette police.
 */
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-inter-tight',
  display: 'swap',
  preload: false
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${interTight.variable}`}>
      <body className="min-h-dvh bg-canvas font-sans text-ink">
        <SWRConfig
          value={{
            fallback: {
              '/api/user': getUser(),
              '/api/tenant': getTenantForUser()
            }
          }}
        >
          {children}
        </SWRConfig>
      </body>
    </html>
  );
}
