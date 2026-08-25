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
]) {
  process.env[name] = '';
}
