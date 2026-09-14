import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Sortie autonome, pour l'image Docker.
   *
   * Next écrit dans `.next/standalone` un serveur qui embarque ses seules
   * dépendances utiles : l'image finale n'a pas à copier `node_modules`, qui
   * pèse plus d'un gigaoctet ici à cause d'hyperframes. Sans effet sur le
   * déploiement Vercel, qui ignore ce champ.
   */
  output: 'standalone',

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
   *
   * Même piège pour les clients AWS v3 : chaque client est un graphe de
   * plusieurs milliers de modules (commands, middleware, serde). Ils sont
   * appelés depuis `lib/storage/r2.ts`, `lib/voice/polly.ts` et
   * `lib/render/lambda.ts` — statiquement ou en import dynamique littéral —
   * et n'ont aucune raison d'entrer dans le bundle. `msedge-tts` traîne
   * `protobufjs` derrière lui, même traitement.
   */
  /**
   * Le gabarit de composition, embarqué dans la fonction serveur.
   *
   * `lib/render/materialize.ts` ouvre `render/gentube-v1` par chemin : rien ne
   * l'importe, donc le traçage de fichiers de Next ne le voit pas et ne le
   * déploie pas. Le montage tombait sur `ENOENT: lstat 'render/gentube-v1'`
   * — l'écran n'a jamais pu produire un MP4 pour cette raison.
   *
   * On n'embarque que `COMPOSITION_PARTS` (520 Ko) : le `media/` du dossier
   * est de la démonstration, vingt-cinq mégaoctets qu'un rendu écrase.
   */
  outputFileTracingIncludes: {
    '/dashboard/videos/[id]': [
      './render/gentube-v1/style.css',
      './render/gentube-v1/hyperframes.json',
      './render/gentube-v1/vendor/**',
    ],
    '/api/internal/render': [
      './render/gentube-v1/style.css',
      './render/gentube-v1/hyperframes.json',
      './render/gentube-v1/vendor/**',
    ],
  },

  serverExternalPackages: [
    'esbuild',
    'drizzle-kit',
    '@hyperframes/aws-lambda',
    'hyperframes',
    '@aws-sdk/client-s3',
    '@aws-sdk/client-polly',
    '@aws-sdk/s3-request-presigner',
    'msedge-tts',
  ],
};

export default nextConfig;
