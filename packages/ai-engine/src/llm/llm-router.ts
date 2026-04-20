// File: packages/ai-engine/src/llm/llm-router.ts

import type { Redis } from "@upstash/redis";
import type { LLMProvider } from "@voz/shared";
import { GeminiFlashProvider } from "./gemini-flash.provider.js";
import { GroqLlamaProvider } from "./groq-llama.provider.js";

export interface LLMRouterOptions {
  geminiApiKey: string;
  groqApiKey: string;
  redis?: Redis;
  geminiDailyTokenLimit?: number;
}

function tokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRateOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const msg = error.message.toLowerCase();
  return msg.includes("429") || msg.includes("rate") || msg.includes("timeout");
}

type LLMGenerateInput = {
  systemPrompt: string;
  userPrompt: string;
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
};

export class LLMRouter implements LLMProvider {
  private readonly primary: GeminiFlashProvider;
  private readonly fallback: GroqLlamaProvider;
  private readonly redis?: Redis;
  private readonly tokenLimit: number;

  constructor(options: LLMRouterOptions) {
    this.primary = new GeminiFlashProvider({
      apiKey: options.geminiApiKey,
      timeoutMs: 5000,
    });

    this.fallback = new GroqLlamaProvider({
      apiKey: options.groqApiKey,
    });

    if (options.redis !== undefined) {
      this.redis = options.redis;
    }
    this.tokenLimit = options.geminiDailyTokenLimit ?? 900000;
  }

  private async shouldUseFallback(input: LLMGenerateInput): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    const key = `llm:gemini:tokens:${dayKey()}`;
    const used = (await this.redis.get<number>(key)) ?? 0;

    const estimated = tokenEstimate(input.systemPrompt) +
      tokenEstimate(input.userPrompt) +
      input.history.reduce((sum, message) => sum + tokenEstimate(message.content), 0) +
      400;

    return used + estimated > this.tokenLimit;
  }

  private async trackGeminiUsage(input: LLMGenerateInput): Promise<void> {
    if (!this.redis) {
      return;
    }

    const key = `llm:gemini:tokens:${dayKey()}`;
    const estimate = tokenEstimate(input.systemPrompt) +
      tokenEstimate(input.userPrompt) +
      input.history.reduce((sum, message) => sum + tokenEstimate(message.content), 0) +
      400;

    await this.redis.incrby(key, estimate);
    await this.redis.expire(key, 60 * 60 * 24);
  }

  async generate(input: LLMGenerateInput): Promise<{
    text: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
    raw?: unknown;
  }> {
    if (await this.shouldUseFallback(input)) {
      return this.fallback.generate(input);
    }

    try {
      const response = await this.primary.generate(input);
      await this.trackGeminiUsage(input);
      return response;
    } catch (error) {
      if (!isRateOrTimeoutError(error)) {
        throw error;
      }
      return this.fallback.generate(input);
    }
  }

  async *streamGenerate(input: LLMGenerateInput): AsyncGenerator<string> {
    if (await this.shouldUseFallback(input)) {
      if (!this.fallback.streamGenerate) {
        const response = await this.fallback.generate(input);
        yield response.text;
        return;
      }
      yield* this.fallback.streamGenerate(input);
      return;
    }

    try {
      if (!this.primary.streamGenerate) {
        const response = await this.primary.generate(input);
        yield response.text;
      } else {
        for await (const token of this.primary.streamGenerate(input)) {
          yield token;
        }
      }
      await this.trackGeminiUsage(input);
    } catch (error) {
      if (!isRateOrTimeoutError(error)) {
        throw error;
      }
      if (!this.fallback.streamGenerate) {
        const response = await this.fallback.generate(input);
        yield response.text;
      } else {
        yield* this.fallback.streamGenerate(input);
      }
    }
  }
}
