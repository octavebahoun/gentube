import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
    clientSegmentCache: true,
    serverActions: {
      /**
       * Le plafond du corps d'une action serveur.
       *
       * **Il doit suivre `MAX_BYTES` de `lib/assets`.** La valeur par défaut de
       * Next est d'un mégaoctet : le dépôt de fichiers annonçait cent
       * mégaoctets et les refusait tous, la limite du transport arrivant bien
       * avant celle du métier. Une capture d'écran passait, une vidéo jamais.
       *
       * Les deux chiffres se lisent ensemble : changer l'un sans l'autre
       * redonne un refus qui ne dit pas son nom.
       */
      bodySizeLimit: '100mb',
    },
  },
  serverExternalPackages: ['esbuild', 'drizzle-kit'],
};

export default nextConfig;
