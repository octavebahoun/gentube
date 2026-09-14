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
  /**
   * Paquets laissés au `require` du serveur au lieu d'être bundlés.
   *
   * `@hyperframes/aws-lambda` n'est appelé qu'en `await import()` derrière un
   * garde d'environnement, mais un import dynamique à chemin littéral est
   * bundlé quand même : le graphe tirait tout hyperframes — puppeteer,
   * ffmpeg-static, onnxruntime, sharp — et le build mourait d'un OOM sur
   * l'hébergement. Il n'a rien à faire dans le bundle : le rendu s'exécute
   * sur Lambda, le serveur ne fait que démarrer l'exécution.
   */
  serverExternalPackages: [
    'esbuild',
    'drizzle-kit',
    '@hyperframes/aws-lambda',
    'hyperframes',
  ],
};

export default nextConfig;
