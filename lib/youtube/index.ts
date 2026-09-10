import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { eq } from 'drizzle-orm';
import { tenantDb, type TenantDb } from '@/lib/db/tenant-db';
import { youtubeTokens, type YoutubeToken } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/crypto/encryption';

type OAuth2Client = Auth.OAuth2Client;

export class YoutubeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YoutubeConfigError';
  }
}

export class YoutubeAuthError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'YoutubeAuthError';
    this.statusCode = statusCode;
  }
}

export class YoutubeUploadError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'YoutubeUploadError';
    this.statusCode = statusCode;
  }
}

/**
 * Crée un client OAuth2 YouTube avec les credentials de l'environnement.
 * La redirect URI doit être ${BASE_URL}/api/youtube/callback.
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const baseUrl = process.env.BASE_URL?.trim();

  if (!clientId || !clientSecret) {
    throw new YoutubeConfigError(
      'YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be set.'
    );
  }

  if (!baseUrl) {
    throw new YoutubeConfigError('BASE_URL must be set for OAuth redirect.');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/youtube/callback`
  );
}

/**
 * Génère l'URL d'autorisation YouTube OAuth.
 * Scopes: upload videos, view channel info, view analytics.
 */
export function getAuthorizationUrl(tenantId: number): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    state: String(tenantId),
    prompt: 'consent',
  });
}

/**
 * Échange le code d'autorisation contre des tokens et les stocke chiffrés.
 */
export async function handleOAuthCallback(
  code: string,
  state: string
): Promise<number> {
  const tenantId = Number(state);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new YoutubeAuthError('Invalid state parameter.', 400);
  }

  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new YoutubeAuthError('Missing tokens from YouTube response.', 500);
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = encrypt(tokens.refresh_token);

  const tdb = tenantDb(tenantId);
  const existing = await tdb.findFirst(
    youtubeTokens,
    eq(youtubeTokens.tenantId, tenantId)
  );

  if (existing) {
    await tdb.update(
      youtubeTokens,
      {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        scope: tokens.scope ?? null,
        updatedAt: new Date(),
      },
      eq(youtubeTokens.id, existing.id)
    );
  } else {
    await tdb.insert(youtubeTokens, {
      tenantId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt,
      scope: tokens.scope ?? null,
    });
  }

  return tenantId;
}

/**
 * Récupère les tokens déchiffrés pour un tenant. Rafraîchit si expiré.
 */
async function getValidTokens(tdb: TenantDb): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const record = await tdb.findFirst(
    youtubeTokens,
    eq(youtubeTokens.tenantId, tdb.tenantId)
  );

  if (!record) {
    throw new YoutubeAuthError('YouTube account not connected.', 404);
  }

  const accessToken = decrypt(record.accessToken);
  const refreshToken = decrypt(record.refreshToken);
  const now = Date.now();
  const expiresAt = record.expiresAt.getTime();

  if (expiresAt > now + 60_000) {
    return { accessToken, refreshToken };
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) {
      throw new YoutubeAuthError('Failed to refresh access token.', 500);
    }

    const newExpiresAt = credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : new Date(now + 3600 * 1000);

    const encryptedAccess = encrypt(credentials.access_token);

    await tdb.update(
      youtubeTokens,
      {
        accessToken: encryptedAccess,
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      },
      eq(youtubeTokens.id, record.id)
    );

    return { accessToken: credentials.access_token, refreshToken };
  } catch (error) {
    throw new YoutubeAuthError(
      'Failed to refresh YouTube access token. Reconnect your channel.',
      401
    );
  }
}

/**
 * Crée un client YouTube authentifié pour un tenant.
 */
export async function getAuthenticatedYoutubeClient(tdb: TenantDb) {
  const { accessToken, refreshToken } = await getValidTokens(tdb);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.youtube({ version: 'v3', auth: oauth2Client });
}

/**
 * Déconnecte la chaîne YouTube d'un tenant (supprime les tokens).
 */
export async function disconnectYoutubeChannel(tdb: TenantDb): Promise<void> {
  await tdb.delete(youtubeTokens, eq(youtubeTokens.tenantId, tdb.tenantId));
}

export type VideoUploadParams = {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus: 'public' | 'private' | 'unlisted';
  categoryId?: string;
};

/**
 * Upload une vidéo sur YouTube et retourne l'ID YouTube.
 * Le fichier vidéo doit être un buffer ou un stream.
 */
export async function uploadVideo(
  tdb: TenantDb,
  videoBuffer: Buffer,
  params: VideoUploadParams
): Promise<string> {
  const youtube = await getAuthenticatedYoutubeClient(tdb);

  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: params.title,
          description: params.description || '',
          tags: params.tags || [],
          categoryId: params.categoryId || '22',
        },
        status: {
          privacyStatus: params.privacyStatus,
        },
      },
      media: {
        body: videoBuffer,
      },
    });

    if (!res.data.id) {
      throw new YoutubeUploadError('YouTube did not return a video ID.', 500);
    }

    return res.data.id;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new YoutubeUploadError(
        `YouTube upload failed: ${error.message}`,
        500
      );
    }
    throw new YoutubeUploadError('YouTube upload failed.', 500);
  }
}

/**
 * Récupère les informations de la chaîne YouTube connectée.
 */
export async function getChannelInfo(tdb: TenantDb): Promise<{
  id: string;
  title: string;
  thumbnailUrl?: string;
}> {
  const youtube = await getAuthenticatedYoutubeClient(tdb);

  try {
    const res = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel || !channel.id) {
      throw new YoutubeAuthError('No YouTube channel found.', 404);
    }

    return {
      id: channel.id,
      title: channel.snippet?.title || 'Unknown',
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url || undefined,
    };
  } catch (error: unknown) {
    if (error instanceof YoutubeAuthError) throw error;
    if (error instanceof Error) {
      throw new YoutubeAuthError(
        `Failed to fetch channel info: ${error.message}`,
        500
      );
    }
    throw new YoutubeAuthError('Failed to fetch channel info.', 500);
  }
}
