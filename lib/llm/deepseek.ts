/**
 * DeepSeek client — the LLM behind script and storyboard generation (P1).
 *
 * The API is OpenAI-compatible: `POST /chat/completions`, bearer auth,
 * `response_format: { type: 'json_object' }`. Two things about it are NOT the
 * OpenAI defaults, and both were confirmed against the live account rather
 * than assumed:
 *
 *   - The model ids are `deepseek-v4-flash` / `deepseek-v4-pro` (+ a vision
 *     variant). There is no `deepseek-chat`.
 *   - These are *reasoning* models. The answer is preceded by internal
 *     reasoning that is billed as completion tokens and returned separately in
 *     `reasoning_content`. A tight `max_tokens` is spent entirely on reasoning
 *     and comes back with `finish_reason: "length"` and an EMPTY content — a
 *     failure that looks like a model refusing to answer. Hence the wide
 *     default budget and the explicit error below.
 */

export type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Covers reasoning *and* the answer — reasoning eats this budget first. */
  maxTokens: number;
};

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_MAX_TOKENS = 8_000;

export class LlmNotConfiguredError extends Error {
  readonly statusCode = 503;

  constructor(missing: string) {
    super(
      `Storyboard generation is not configured: ${missing} is missing.`
    );
    this.name = 'LlmNotConfiguredError';
  }
}

export class LlmError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'LlmError';
    this.statusCode = statusCode;
  }
}

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function deepSeekConfig(): DeepSeekConfig {
  const apiKey = read('DEEPSEEK_API_KEY');
  if (!apiKey) throw new LlmNotConfiguredError('DEEPSEEK_API_KEY');

  const maxTokens = Number(read('DEEPSEEK_MAX_TOKENS') ?? DEFAULT_MAX_TOKENS);

  return {
    apiKey,
    baseUrl: (read('DEEPSEEK_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: read('DEEPSEEK_MODEL') ?? DEFAULT_MODEL,
    maxTokens:
      Number.isInteger(maxTokens) && maxTokens > 0
        ? maxTokens
        : DEFAULT_MAX_TOKENS,
  };
}

export function isLlmConfigured(): boolean {
  try {
    deepSeekConfig();
    return true;
  } catch {
    return false;
  }
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type JsonCompletion = {
  /** Parsed `content`. Callers validate the shape themselves. */
  data: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
  };
};

export interface JsonCompleter {
  completeJson(messages: ChatMessage[]): Promise<JsonCompletion>;
}

export class DeepSeekClient implements JsonCompleter {
  constructor(private readonly config: DeepSeekConfig = deepSeekConfig()) {}

  get model(): string {
    return this.config.model;
  }

  /** One JSON answer. Anything that is not usable JSON throws. */
  async completeJson(messages: ChatMessage[]): Promise<JsonCompletion> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: this.config.maxTokens,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      let detail = text.slice(0, 300);
      try {
        detail = JSON.parse(text)?.error?.message ?? detail;
      } catch {
        // Keep the raw excerpt — never the request, which carries the key.
      }
      throw new LlmError(
        `DeepSeek returned HTTP ${response.status}: ${detail}`,
        response.status === 429 ? 429 : 502
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new LlmError('DeepSeek returned a non-JSON envelope.');
    }

    const choice = payload?.choices?.[0];
    const content: string = choice?.message?.content ?? '';
    const usage = {
      promptTokens: Number(payload?.usage?.prompt_tokens ?? 0),
      completionTokens: Number(payload?.usage?.completion_tokens ?? 0),
      reasoningTokens: Number(
        payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0
      ),
    };

    if (choice?.finish_reason === 'length' && !content.trim()) {
      // The whole budget went into reasoning. Says so, instead of reporting an
      // empty answer and leaving the next reader to guess why.
      throw new LlmError(
        `DeepSeek spent its whole ${this.config.maxTokens}-token budget on ` +
          `reasoning (${usage.reasoningTokens} tokens) and returned nothing. ` +
          'Raise DEEPSEEK_MAX_TOKENS or ask for fewer shots.'
      );
    }

    if (!content.trim()) {
      throw new LlmError('DeepSeek returned an empty answer.');
    }

    try {
      return { data: JSON.parse(content), usage };
    } catch {
      throw new LlmError('DeepSeek did not return valid JSON.');
    }
  }
}

export function createDeepSeekClient(): DeepSeekClient {
  return new DeepSeekClient(deepSeekConfig());
}
