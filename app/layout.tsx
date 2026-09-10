import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, DM_Sans, Space_Mono } from 'next/font/google';
import { getUser, getTenantForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { Ambiance } from '@/components/gx/gx-theme';
import { MireRail } from '@/components/gx/gx-rail';

export const metadata: Metadata = {
  title: 'GenTube — Décrivez. On monte.',
  description:
    'Vous décrivez un sujet, GenTube rend un MP4 monté : voix française, images, sous-titres karaoké et musique. Essai gratuit, paiement mobile money en FCFA.'
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#050608' },
    { media: '(prefers-color-scheme: light)', color: '#F5F5F5' }
  ],
  maximumScale: 5
};

/* Space Grotesk descend de Space Mono : le titre et le timecode ont la même
   ossature. DM Sans porte le texte courant, sans chercher à être remarqué. */
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap'
});

const dm = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm',
  display: 'swap'
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap'
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${grotesk.variable} ${dm.variable} ${spaceMono.variable}`}
    >
      <body className="min-h-[100dvh] bg-ink text-paper">
        <Ambiance>
          {/* La mire en haut : la signature, et le repère d'avancement. */}
          <MireRail />
          <SWRConfig
            value={{
              fallback: {
                // On n'attend PAS ici
                // Seuls les composants qui lisent ces données se suspendront
                '/api/user': getUser(),
                '/api/tenant': getTenantForUser()
              }
            }}
          >
            {children}
          </SWRConfig>
        </Ambiance>
      </body>
    </html>
  );
}
