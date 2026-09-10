import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getChannelInfo } from '@/lib/youtube';
import { getUser } from '@/lib/db/queries';
import { tenantDb } from '@/lib/db/tenant-db';

/**
 * GET /api/youtube/status
 * Vérifie si YouTube est connecté et retourne les infos de la chaîne.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { connected: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const tdb = tenantDb(user.tenantId);
    
    try {
      const channel = await getChannelInfo(tdb);
      return NextResponse.json({
        connected: true,
        channel: {
          id: channel.id,
          title: channel.title,
          thumbnailUrl: channel.thumbnailUrl,
        },
      });
    } catch (error: any) {
      if (error.statusCode === 404 || error.name === 'YoutubeAuthError') {
        return NextResponse.json({ connected: false });
      }
      throw error;
    }
  } catch (error) {
    console.error('[youtube/status] Error:', error);
    return NextResponse.json(
      { connected: false, error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
