import { FPS } from '@/lib/storyboard/render';

/**
 * Rendu distribué sur AWS Lambda.
 *
 * **Pourquoi le SDK et non la CLI.** `hyperframes lambda render` lit les
 * coordonnées de la pile dans un fichier d'état écrit par `deploy` sur la
 * machine qui a déployé. Un serveur Next.js n'a pas ce fichier — et sur un
 * hébergement sans disque il ne peut pas l'avoir. Les coordonnées viennent
 * donc de l'environnement, et on appelle `@hyperframes/aws-lambda/sdk`
 * directement.
 *
 * **Le rendu ne bloque pas.** `renderToLambda` démarre une exécution Step
 * Functions et rend la main. C'est la bonne forme : une vidéo de dix minutes
 * se rend en morceaux parallèles pendant plusieurs minutes, et aucune requête
 * HTTP ne doit attendre ça. D'où deux verbes ici — démarrer, puis relever.
 *
 * La reprise tient à un seul fait : `renderId` est le nom de l'exécution Step
 * Functions, et la clé S3 de sortie en découle. Stocké dans
 * `jobs.external_id`, qui est unique, il permet à un webhook rejoué de
 * résoudre exactement un job.
 */

const DEFAULT_QUALITY = 'standard';
const DEFAULT_CHUNKS = 16;

/**
 * Mémoire de la fonction, en Mo. Sert au calcul de coût, pas au
 * dimensionnement : la pile est déployée avec sa propre valeur, et c'est celle
 * qu'il faut recopier ici pour que le coût rapporté soit juste.
 */
const DEFAULT_MEMORY_MB = 10_240;

export class RenderNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(
      `Lambda rendering is not configured: ${missing} is missing. ` +
        'Run `npx hyperframes lambda deploy` and copy the stack outputs into the ' +
        'environment (see render/aws/README.md).'
    );
    this.name = 'RenderNotConfiguredError';
  }
}

export class RenderError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'RenderError';
    this.statusCode = statusCode;
  }
}

export type LambdaConfig = {
  /** Sortie `RenderBucketName` de la pile. */
  bucket: string;
  /** Sortie `RenderStateMachineArn` de la pile. */
  stateMachineArn: string;
  region: string;
  memoryMb: number;
  quality: 'draft' | 'standard' | 'high';
  maxParallelChunks: number;
};

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function lambdaConfig(): LambdaConfig {
  const bucket = read('HYPERFRAMES_RENDER_BUCKET');
  if (!bucket) throw new RenderNotConfiguredError('HYPERFRAMES_RENDER_BUCKET');
  const stateMachineArn = read('HYPERFRAMES_STATE_MACHINE_ARN');
  if (!stateMachineArn) {
    throw new RenderNotConfiguredError('HYPERFRAMES_STATE_MACHINE_ARN');
  }

  const quality = read('HYPERFRAMES_QUALITY');
  return {
    bucket,
    stateMachineArn,
    region: read('AWS_REGION') ?? 'us-east-1',
    memoryMb: readInt('HYPERFRAMES_LAMBDA_MEMORY_MB', DEFAULT_MEMORY_MB),
    quality:
      quality === 'draft' || quality === 'high' ? quality : DEFAULT_QUALITY,
    maxParallelChunks: readInt(
      'HYPERFRAMES_MAX_PARALLEL_CHUNKS',
      DEFAULT_CHUNKS
    ),
  };
}

export function isRenderConfigured(): boolean {
  try {
    lambdaConfig();
    return true;
  } catch {
    return false;
  }
}

export type StartedRender = {
  /** Nom de l'exécution Step Functions. Ce que `jobs.external_id` stocke. */
  renderId: string;
  executionArn: string;
  /** `s3://bucket/renders/<renderId>/output.mp4`, prévisible avant la fin. */
  outputS3Uri: string;
};

export type RenderState = {
  status: 'running' | 'succeeded' | 'failed';
  /** 0 à 1. Vaut 0 tant que le découpage en morceaux n'est pas connu. */
  progress: number;
  framesRendered: number;
  totalFrames: number | null;
  /** Coût réel de ce rendu en USD, une fois connu. */
  costUsd: number | null;
  /** Renseigné seulement quand l'assemblage a réussi. */
  output: { s3Uri: string; bytes: number | null } | null;
  errors: string[];
};

/**
 * Ce que le service attend d'un moteur de rendu. Trois verbes, pas un de plus,
 * et aucun ne connaît la base de données.
 */
export interface RenderEngine {
  start(input: {
    projectDir: string;
    width: number;
    height: number;
    executionName: string;
  }): Promise<StartedRender>;
  state(executionArn: string): Promise<RenderState>;
  download(s3Uri: string): Promise<Buffer>;
}

/** Découpe `s3://bucket/clé` en ses deux morceaux. */
export function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new RenderError(`Not an S3 URI: ${uri}`, 500);
  return { bucket: match[1], key: match[2] };
}

export class LambdaRenderEngine implements RenderEngine {
  constructor(private readonly config: LambdaConfig = lambdaConfig()) {}

  async start({
    projectDir,
    width,
    height,
    executionName,
  }: {
    projectDir: string;
    width: number;
    height: number;
    executionName: string;
  }): Promise<StartedRender> {
    const { renderToLambda } = await import('@hyperframes/aws-lambda/sdk');

    const handle = await renderToLambda({
      projectDir,
      bucketName: this.config.bucket,
      stateMachineArn: this.config.stateMachineArn,
      region: this.config.region,
      executionName,
      // `v2` transporte un manifeste adressé par contenu au lieu d'une archive
      // de plan. La documentation du paquet demande explicitement que les
      // nouvelles intégrations le choisissent ; `v1` n'est gardé que pour la
      // compatibilité.
      planProtocol: 'v2',
      config: {
        fps: FPS as 30,
        width,
        height,
        format: 'mp4',
        codec: 'h264',
        quality: this.config.quality,
        maxParallelChunks: this.config.maxParallelChunks,
      },
    });

    return {
      renderId: handle.renderId,
      executionArn: handle.executionArn,
      outputS3Uri: handle.outputS3Uri,
    };
  }

  async state(executionArn: string): Promise<RenderState> {
    const { getRenderProgress } = await import('@hyperframes/aws-lambda/sdk');

    const progress = await getRenderProgress({
      executionArn,
      region: this.config.region,
      defaultMemorySizeMb: this.config.memoryMb,
    });

    // Step Functions distingue cinq états terminaux ; le service n'a besoin
    // que de « en cours », « fini », « perdu ».
    const status =
      progress.status === 'SUCCEEDED'
        ? 'succeeded'
        : progress.status === 'RUNNING' || progress.status === 'PENDING_REDRIVE'
          ? 'running'
          : 'failed';

    return {
      status,
      progress: progress.overallProgress,
      framesRendered: progress.framesRendered,
      totalFrames: progress.totalFrames,
      // `accruedSoFarUsd` et non un total : Lambda et Step Functions sont
      // facturés à mesure, donc un rendu en cours a déjà un coût. Il devient
      // le coût final quand l'exécution se termine. C'est le chiffre à
      // confronter aux ~12 FCFA la minute annoncés dans docs/tarifs.md.
      costUsd: progress.costs?.accruedSoFarUsd ?? null,
      output: progress.outputFile,
      errors: progress.errors.map(
        (error) => `${error.state}: ${error.error} — ${error.cause}`.slice(0, 500)
      ),
    };
  }

  async download(s3Uri: string): Promise<Buffer> {
    const { GetObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    const { bucket, key } = parseS3Uri(s3Uri);

    const client = new S3Client({ region: this.config.region });
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!response.Body) {
      throw new RenderError(`S3 returned no body for ${s3Uri}.`);
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }
}

export function createRenderEngine(): RenderEngine {
  return new LambdaRenderEngine(lambdaConfig());
}
