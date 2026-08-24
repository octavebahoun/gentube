import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeepSeekClient,
  LlmError,
  LlmNotConfiguredError,
  deepSeekConfig,
  isLlmConfigured,
} from './deepseek';

const MANAGED = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MAX_TOKENS',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MANAGED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

/** One canned HTTP answer for the next fetch. */
function stubFetch(
  payload: unknown,
  { status = 200, raw }: { status?: number; raw?: string } = {}
) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(raw ?? JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The shape the live API returns: content, plus reasoning billed separately. */
function completion(
  content: string,
  { finishReason = 'stop', reasoningTokens = 275 } = {}
) {
  return {
    choices: [
      {
        finish_reason: finishReason,
        message: { role: 'assistant', content, reasoning_content: 'thinking…' },
      },
    ],
    usage: {
      prompt_tokens: 151,
      completion_tokens: 399,
      completion_tokens_details: { reasoning_tokens: reasoningTokens },
    },
  };
}

const client = () =>
  new DeepSeekClient({
    apiKey: 'sk-test-key',
    baseUrl: 'https://api.deepseek.test',
    model: 'deepseek-v4-flash',
    maxTokens: 8_000,
  });

describe('deepSeekConfig', () => {
  it('defaults to the flash model and a wide token budget', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-abc';

    expect(deepSeekConfig()).toEqual({
      apiKey: 'sk-abc',
      baseUrl: 'https://api.deepseek.com',
      // Confirmed against the account: there is no `deepseek-chat` here.
      model: 'deepseek-v4-flash',
      maxTokens: 8_000,
    });
  });

  it('honours the overrides and trims a trailing slash', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-abc';
    process.env.DEEPSEEK_MODEL = 'deepseek-v4-pro';
    process.env.DEEPSEEK_BASE_URL = 'https://proxy.test/v1/';
    process.env.DEEPSEEK_MAX_TOKENS = '20000';

    expect(deepSeekConfig()).toMatchObject({
      model: 'deepseek-v4-pro',
      baseUrl: 'https://proxy.test/v1',
      maxTokens: 20_000,
    });
  });

  it('ignores a nonsense token budget rather than sending it', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-abc';
    for (const value of ['zero', '0', '-5', '1.5']) {
      process.env.DEEPSEEK_MAX_TOKENS = value;
      expect(deepSeekConfig().maxTokens).toBe(8_000);
    }
  });

  it('refuses to run without a key', () => {
    expect(isLlmConfigured()).toBe(false);
    expect(() => deepSeekConfig()).toThrow(LlmNotConfiguredError);
    process.env.DEEPSEEK_API_KEY = 'sk-abc';
    expect(isLlmConfigured()).toBe(true);
  });
});

describe('DeepSeekClient.completeJson', () => {
  it('asks for JSON, authenticates, and returns the parsed answer', async () => {
    const fetchMock = stubFetch(completion('{"shots":[{"type":"image"}]}'));

    const result = await client().completeJson([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'theme' },
    ]);

    expect(result.data).toEqual({ shots: [{ type: 'image' }] });
    expect(result.usage).toEqual({
      promptTokens: 151,
      completionTokens: 399,
      reasoningTokens: 275,
    });

    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error('fetch called without options');
    expect(url).toBe('https://api.deepseek.test/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      response_format: { type: 'json_object' },
      max_tokens: 8_000,
      messages: [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'theme' },
      ],
    });
  });

  it('explains an answer eaten entirely by reasoning', async () => {
    // The real failure mode of a reasoning model on a tight budget: 200 OK,
    // finish_reason "length", empty content, and the tokens all spent thinking.
    stubFetch(completion('', { finishReason: 'length', reasoningTokens: 400 }));

    await expect(client().completeJson([])).rejects.toThrow(
      /budget on reasoning \(400 tokens\)/
    );
    await expect(client().completeJson([])).rejects.toThrow(LlmError);
  });

  it('rejects an empty answer', async () => {
    stubFetch(completion('   '));
    await expect(client().completeJson([])).rejects.toThrow(/empty answer/);
  });

  it('rejects prose where JSON was asked for', async () => {
    stubFetch(completion('Here is your storyboard!'));
    await expect(client().completeJson([])).rejects.toThrow(/valid JSON/);
  });

  it('surfaces the gateway error message and keeps 429 distinct', async () => {
    stubFetch(
      { error: { message: 'Rate limit reached' } },
      { status: 429 }
    );

    try {
      await client().completeJson([]);
      throw new Error('expected an LlmError');
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).statusCode).toBe(429);
      expect((error as Error).message).toContain('Rate limit reached');
    }
  });

  it('never puts the api key in an error message', async () => {
    stubFetch(null, { status: 500, raw: '<html>upstream boom</html>' });

    await expect(client().completeJson([])).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('sk-test-key'),
      })
    );
  });

  it('reports a non-JSON envelope distinctly from bad content', async () => {
    stubFetch(null, { status: 200, raw: 'not json at all' });
    await expect(client().completeJson([])).rejects.toThrow(/non-JSON envelope/);
  });
});
