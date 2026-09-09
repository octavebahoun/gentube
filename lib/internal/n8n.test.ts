import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_WEBHOOK_PATH,
  startProductionWorkflow,
} from './n8n';

afterEach(() => {
  process.env.N8N_BASE_URL = '';
  process.env.N8N_WEBHOOK_SECRET = '';
  process.env.INTERNAL_API_TOKEN = '';
  vi.unstubAllGlobals();
});

describe('startProductionWorkflow', () => {
  it('does not call the network when N8N_BASE_URL is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await startProductionWorkflow(1, 42);

    expect(result).toEqual({
      started: false,
      reason: 'N8N_BASE_URL is not set.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs tenantId and videoId to the production webhook, signed with N8N_WEBHOOK_SECRET', async () => {
    process.env.N8N_BASE_URL = 'https://n8n.test/';
    process.env.N8N_WEBHOOK_SECRET = 'n8n-secret';
    process.env.INTERNAL_API_TOKEN = 'internal-token';

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await startProductionWorkflow(7, 99);

    expect(result).toEqual({ started: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://n8n.test${PRODUCTION_WEBHOOK_PATH}`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer n8n-secret',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ tenantId: 7, videoId: 99 }),
      })
    );
  });

  it('throws when n8n answers with an error, so the caller can log it', async () => {
    process.env.N8N_BASE_URL = 'https://n8n.test';
    process.env.N8N_WEBHOOK_SECRET = 'n8n-secret';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    );

    await expect(startProductionWorkflow(1, 2)).rejects.toThrow(
      /n8n webhook responded 500/
    );
  });
});
