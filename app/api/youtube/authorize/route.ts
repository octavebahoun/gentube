import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuthorizationUrl, YoutubeConfigError } from '@/lib/youtube';
import { getUser } from '@/lib/db/queries';

/**
 * GET /api/youtube/authorize
 * Redirige vers l'écran de consentement YouTube OAuth.
 * Le user doit être connecté (session).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const tenantId = user.tenantId;
    const authUrl = getAuthorizationUrl(tenantId);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    if (error instanceof YoutubeConfigError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }

    console.error('[youtube/authorize] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start authorization.' },
      { status: 500 }
    );
  }
}
