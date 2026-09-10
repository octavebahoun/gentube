import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callInternal, InternalApiError } from './client';

describe('callInternal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    global.fetch = vi.fn();
  });

  it('throws if INTERNAL_API_TOKEN is missing', async () => {
    process.env.INTERNAL_API_TOKEN = '';

    await expect(
      callInternal({ endpoint: 'voice', tenantId: 1, videoId: 2 })
    ).rejects.toThrow(InternalApiError);

    await expect(
      callInternal({ endpoint: 'voice', tenantId: 1, videoId: 2 })
    ).rejects.toThrow('INTERNAL_API_TOKEN not configured');
  });

  it('calls the correct endpoint with auth and body', async () => {
    process.env.INTERNAL_API_TOKEN = 'test-token';
    const mockResponse = { ok: true, step: 'voiceover', voiced: 3 };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await callInternal({
      endpoint: 'voice',
      tenantId: 42,
      videoId: 100,
      baseUrl: 'https://example.com',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/internal/voice',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ tenantId: 42, videoId: 100 }),
      }
    );

    expect(result).toEqual(mockResponse);
  });

  it('throws InternalApiError on non-ok response', async () => {
    process.env.INTERNAL_API_TOKEN = 'test-token';
    const mockErrorResponse = { ok: false, message: 'Video not found' };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => mockErrorResponse,
    });

    await expect(
      callInternal({ endpoint: 'voice', tenantId: 1, videoId: 999 })
    ).rejects.toThrow(InternalApiError);

    try {
      await callInternal({ endpoint: 'voice', tenantId: 1, videoId: 999 });
    } catch (error) {
      expect(error).toBeInstanceOf(InternalApiError);
      expect((error as InternalApiError).statusCode).toBe(404);
      expect((error as InternalApiError).response).toEqual(mockErrorResponse);
    }
  });

  it('throws InternalApiError when response.ok is false even if HTTP 200', async () => {
    process.env.INTERNAL_API_TOKEN = 'test-token';
    const mockErrorResponse = { ok: false, message: 'Insufficient credits' };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockErrorResponse,
    });

    await expect(
      callInternal({ endpoint: 'images', tenantId: 1, videoId: 2 })
    ).rejects.toThrow('Insufficient credits');
  });
});
