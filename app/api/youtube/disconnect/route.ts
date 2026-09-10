import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { disconnectYoutubeChannel } from '@/lib/youtube';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';

/**
 * POST /api/youtube/disconnect
 * Déconnecte la chaîne YouTube du tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const tdb = tenantDb(user.tenantId);
    await disconnectYoutubeChannel(tdb);

    return NextResponse.json({ ok: true, message: 'YouTube channel disconnected.' });
  } catch (error) {
    console.error('[youtube/disconnect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect YouTube channel.' },
      { status: 500 }
    );
  }
}
