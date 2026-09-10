import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

const protectedRoutes = '/dashboard';

const LOCALE_PREFIXES = ['en', 'es', 'de', 'it', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Redirect locale-prefixed routes (e.g., /en/*, /es/*) to non-prefixed FR routes
  const localeMatch = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (localeMatch && LOCALE_PREFIXES.includes(localeMatch[1])) {
    const pathWithoutLocale = localeMatch[2] || '/';
    return NextResponse.redirect(new URL(pathWithoutLocale, request.url));
  }

  const sessionCookie = request.cookies.get('session');
  const isProtectedRoute = pathname.startsWith(protectedRoutes);

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  let res = NextResponse.next();

  if (sessionCookie && request.method === 'GET') {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

      res.cookies.set({
        name: 'session',
        value: await signToken({
          ...parsed,
          expires: expiresInOneDay.toISOString()
        }),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresInOneDay
      });
    } catch (error) {
      console.error('Error updating session:', error);
      res.cookies.delete('session');
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs'
};
