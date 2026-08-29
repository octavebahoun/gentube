import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import path from 'node:path';

const execAsync = promisify(exec);
const ENV_PATH = path.join(process.cwd(), '.env');
const EXAMPLE_PATH = path.join(process.cwd(), '.env.example');

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function startPostgres() {
  try {
    await execAsync('docker --version');
  } catch {
    console.error(
      'Docker is not installed. Install it (https://docs.docker.com/get-docker/) ' +
        'or set DATABASE_URL in .env to a remote Postgres and skip this step.'
    );
    process.exit(1);
  }

  console.log('Starting Postgres (docker compose up -d)...');
  await execAsync('docker compose up -d');
  console.log('Postgres is up on localhost:54322.');
}

/** Fills the blank secrets in .env.example and writes .env. */
async function writeEnvFile() {
  if (await exists(ENV_PATH)) {
    console.log('.env already exists — leaving it untouched.');
    return;
  }

  const generated: Record<string, string> = {
    AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    PAYMENT_CREDENTIALS_KEK: crypto.randomBytes(32).toString('hex'),
  };

  const template = await fs.readFile(EXAMPLE_PATH, 'utf8');
  const filled = template
    .split('\n')
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=$/);
      const value = match ? generated[match[1]] : undefined;
      return value ? `${match![1]}=${value}` : line;
    })
    .join('\n');

  await fs.writeFile(ENV_PATH, filled);
  console.log(
    '.env created with a fresh AUTH_SECRET, ENCRYPTION_KEY and PAYMENT_CREDENTIALS_KEK.'
  );
  console.log(
    'Provider keys (Replicate, R2, ElevenLabs, YouTube, ...) are left blank — ' +
      'none of them are needed for this step.'
  );
}

async function main() {
  await startPostgres();
  await writeEnvFile();
  console.log('\nNext: pnpm db:migrate && pnpm db:seed && pnpm dev');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
