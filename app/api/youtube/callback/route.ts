import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleOAuthCallback, YoutubeAuthError } from '@/lib/youtube';

/**
 * GET /api/youtube/callback
 * Callback OAuth YouTube. Échange le code contre des tokens et redirige.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `${process.env.BASE_URL}/dashboard?youtube_error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.BASE_URL}/dashboard?youtube_error=missing_parameters`
      );
    }

    const tenantId = await handleOAuthCallback(code, state);

    return NextResponse.redirect(
      `${process.env.BASE_URL}/dashboard?youtube_connected=true`
    );
  } catch (error) {
    console.error('[youtube/callback] Error:', error);

    let errorMessage = 'connection_failed';
    if (error instanceof YoutubeAuthError) {
      errorMessage = error.message.toLowerCase().replace(/\s+/g, '_');
    }

    return NextResponse.redirect(
      `${process.env.BASE_URL}/dashboard?youtube_error=${encodeURIComponent(errorMessage)}`
    );
  }
}
