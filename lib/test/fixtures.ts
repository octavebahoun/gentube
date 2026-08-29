import { createHmac } from 'node:crypto';
import { client, db } from '@/lib/db/drizzle';
import { resetDatabase } from '@/lib/db/reset';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import {
  projects,
  tenants,
  videos,
  type GatewayEnvironment,
  type Plan,
  type Resolution,
} from '@/lib/db/schema';

export async function resetDb() {
  await resetDatabase();
}

export async function closeDb() {
  await client.end();
}

/** Creates a tenant and hands back a scoped handle for it. */
export async function createTenant(
  name: string,
  { plan = 'starter', credits = 0 }: { plan?: Plan; credits?: number } = {}
): Promise<TenantDb> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name, plan, creditsBalance: credits })
    .returning();
  return tenantDb(tenant.id);
}

/** A project plus a draft video, for tests that need something to scope. */
export async function createProjectWithVideo(
  tdb: TenantDb,
  {
    title = 'Test video',
    resolution = '480p',
  }: { title?: string; resolution?: Resolution } = {}
) {
  const [project] = await tdb.insert(projects, { name: `${title} project` });
  const [video] = await tdb.insert(videos, {
    projectId: project.id,
    title,
    resolution,
  });
  return { project, video };
}

// --- Billing fixtures ------------------------------------------------------

export const TEST_API_SECRET = 'test_api_secret_key_0123456789';
export const TEST_WEBHOOK_SECRET = 'test_webhook_secret_key_0123456789';

/** Stores the platform merchant credentials the webhook pipeline verifies against. */
export async function storeTestPlatformCredentials(
  environment: GatewayEnvironment = 'sandbox'
) {
  const { storeCredentials } = await import('@/lib/payments/credentials');
  return await storeCredentials({
    tenantId: null,
    environment,
    apiKeyPublic: 'gpay_pub_sandbox_test',
    apiSecret: TEST_API_SECRET,
    webhookSecret: TEST_WEBHOOK_SECRET,
    merchantId: 'merchant_test',
    businessName: 'GenTube Test',
  });
}

/**
 * Builds the headers GeniusPay sends: HMAC-SHA256 over `<timestamp>.<raw body>`
 * in hex, plus the event and environment headers.
 */
export function signedWebhookHeaders(
  rawBody: string,
  {
    secret = TEST_WEBHOOK_SECRET,
    event = 'payment.success',
    environment = 'sandbox',
    timestamp = Math.floor(Date.now() / 1000),
  }: {
    secret?: string;
    event?: string;
    environment?: string;
    timestamp?: number;
  } = {}
): Record<string, string> {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return {
    'content-type': 'application/json',
    'x-webhook-event': event,
    'x-webhook-environment': environment,
    'x-webhook-timestamp': String(timestamp),
    'x-webhook-signature': signature,
  };
}

/** A GeniusPay webhook body, in the shape the pipeline reads. */
export function webhookPayload(params: {
  eventId: string;
  event?: string;
  reference: string;
  amount: number;
  status?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    id: params.eventId,
    event: params.event ?? 'payment.success',
    environment: params.environment ?? 'sandbox',
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      id: 1,
      reference: params.reference,
      amount: params.amount,
      currency: 'XOF',
      status: params.status ?? 'completed',
      environment: params.environment ?? 'sandbox',
      metadata: params.metadata ?? {},
    },
  };
}
