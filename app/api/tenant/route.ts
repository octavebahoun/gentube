import { getTenantForUser } from '@/lib/db/queries';

export async function GET() {
  const tenant = await getTenantForUser();
  return Response.json(tenant);
}
