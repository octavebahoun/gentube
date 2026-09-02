import { testDatabaseUrl } from './database';

// S'exécute avant l'import de tout module de test, pour que lib/db/drizzle.ts
// prenne cette valeur au lieu de la base de développement. dotenv n'écrase pas
// les valeurs existantes, donc cette affectation gagne face à .env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET ||= 'test-auth-secret-not-used-for-anything-real';
process.env.ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000001';

// Aucun test ne doit jamais atteindre un fournisseur payant. Sans ce
// garde-fou, un `create*Client()` lit le .env de développement et un test qui
// oublie d'injecter un double appelle le vrai service — c'est exactement ce
// qui est arrivé la première fois que l'adaptateur R2 a existé : deux objets
// écrits dans le bucket de production.
//
// La liste couvre le stockage ET les générateurs, parce que le coût n'est pas
// le même partout : R2 salit un bucket, Workers AI et Replicate facturent, et
// un test qui boucle facture en boucle.
//
// On vide au lieu de supprimer : dotenv est chargé après ce fichier et ne
// réécrit que les clés ABSENTES de process.env. Une clé vide reste donc vide,
// une clé supprimée serait restaurée depuis .env.
// Les tests d'un adaptateur posent eux-mêmes les variables dont ils ont besoin.
for (const name of [
  // Stockage
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PREFIX',
  // Images — Cloudflare Workers AI
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_AI_TOKEN',
  // Clips — Replicate
  'REPLICATE_API_TOKEN',
  'REPLICATE_WEBHOOK_SECRET',
  // Voix
  'ELEVENLABS_API_KEY',
  // Storyboard
  'DEEPSEEK_API_KEY',
  // Montage — AWS Lambda. Un rendu lance une execution Step Functions et
  // facture des Go-secondes : un test qui en declenche une paie pour rien.
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'HYPERFRAMES_RENDER_BUCKET',
  'HYPERFRAMES_STATE_MACHINE_ARN',
]) {
  process.env[name] = '';
}

// Edge TTS n'a pas de clé : rien ne l'empêcherait d'être appelé pour de vrai
// depuis un test qui a oublié d'injecter un double. Gratuit ne veut pas dire
// qu'on a le droit de marteler le service de Microsoft depuis une CI — et un
// test qui dépend du réseau n'est plus un test.
process.env.EDGE_TTS_DISABLED = '1';

/**
 * Le réseau lui-même, coupé.
 *
 * Vider les clés empêche un client de se construire ; ça n'empêche pas un
 * `fetch` écrit en dur d'atteindre le monde. Le cas s'est produit le
 * 2 septembre 2026 : un test du webhook Replicate suivait l'URL du clip
 * jusqu'à une résolution DNS réelle, et rien ne l'a arrêté — c'est le service
 * distant qui a dit non.
 *
 * On remplace donc `fetch` par un refus qui **nomme l'URL demandée**. Un test
 * qui a besoin d'une réponse la pose lui-même avec `vi.stubGlobal('fetch', …)`,
 * ce qui rend la dépendance visible dans le test plutôt que dans les journaux
 * de la CI.
 */
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  throw new Error(
    `Un test a tenté d'atteindre le réseau : ${url}\n` +
      "Posez un double avec vi.stubGlobal('fetch', …) plutôt que d'appeler " +
      'le vrai service.'
  );
}) as typeof fetch;
