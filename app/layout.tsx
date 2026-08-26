import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser, getTenantForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';

export const metadata: Metadata = {
  title: 'GenTube',
  description: 'Multi-tenant AI video generation, from storyboard to YouTube.'
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`bg-background text-foreground ${manrope.className}`}>
      <body className="min-h-[100dvh] bg-background">
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
      </body>
    </html>
  );
}
