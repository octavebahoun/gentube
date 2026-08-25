import { testDatabaseUrl } from './database';

// S'exécute avant l'import de tout module de test, pour que lib/db/drizzle.ts
// prenne cette valeur au lieu de la base de développement. dotenv n'écrase pas
// les valeurs existantes, donc cette affectation gagne face à .env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_SECRET ||= 'test-auth-secret-not-used-for-anything-real';
process.env.ENCRYPTION_KEY ||=
  '0000000000000000000000000000000000000000000000000000000000000001';

// Aucun test ne doit jamais atteindre le vrai R2. Sans ce garde-fou,
// `createAssetStore()` lit le .env de développement et un test qui oublie
// d'injecter un store factice écrit dans le bucket de production — c'est
// exactement ce qui est arrivé la première fois que l'adaptateur a existé.
//
// On vide au lieu de supprimer : dotenv est chargé après ce fichier et ne
// réécrit que les clés ABSENTES de process.env. Une clé vide reste donc vide,
// une clé supprimée serait restaurée depuis .env.
// Les tests du stockage posent eux-mêmes les variables dont ils ont besoin.
for (const name of [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PREFIX',
]) {
  process.env[name] = '';
}
