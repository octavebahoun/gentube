/**
 * Client DeepSeek — le LLM derrière la génération de script et de storyboard (P1).
 *
 * L'API est compatible OpenAI : `POST /chat/completions`, auth bearer,
 * `response_format: { type: 'json_object' }`. Deux choses ne sont PAS les
 * défauts OpenAI, et les deux ont été confirmées auprès du compte réel plutôt
 * que supposées :
 *
 *   - Les ids de modèles sont `deepseek-v4-flash` / `deepseek-v4-pro` (+ une
 *     variante vision). Il n'y a pas de `deepseek-chat`.
 *   - Ce sont des modèles à *raisonnement*. La réponse est précédée d'un
 *     raisonnement interne facturé comme tokens de complétion et renvoyé à
 *     part dans `reasoning_content`. Un `max_tokens` serré est dépensé
 *     entièrement en raisonnement et revient avec `finish_reason: "length"`
 *     et un contenu VIDE — un échec qui ressemble à un modèle refusant de
 *     répondre. D'où le budget par défaut large et l'erreur explicite
 *     ci-dessous.
 */

export type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Couvre le raisonnement *et* la réponse — le raisonnement mange ce budget en premier. */
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
  /** `content` parsé. Les appelants valident la forme eux-mêmes. */
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

  /** Une réponse JSON. Tout ce qui n'est pas du JSON utilisable lève. */
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
        // Conserver l'extrait brut — jamais la requête, qui porte la clé.
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
      // Tout le budget est parti en raisonnement. On le dit, au lieu de
      // rapporter une réponse vide et laisser le prochain lecteur deviner
      // pourquoi.
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
