// File: packages/ai-engine/src/llm/groq-llama.provider.ts

import Groq from "groq-sdk";
import type { LLMProvider } from "@voz/shared";

export interface GroqLlamaProviderOptions {
  apiKey: string;
  model?: string;
}

export class GroqLlamaProvider implements LLMProvider {
  private readonly client: Groq;
  private readonly model: string;

  constructor(options: GroqLlamaProviderOptions) {
    this.client = new Groq({ apiKey: options.apiKey });
    this.model = options.model ?? "llama-3.3-70b-versatile";
  }

  private toGroqMessages(input: {
    userPrompt: string;
    history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  }): Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> {
    const historyMessages = input.history.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    return [
      ...historyMessages,
      { role: "user", content: input.userPrompt },
    ];
  }

  async generate(input: {
    systemPrompt: string;
    userPrompt: string;
    history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
  }): Promise<{
    text: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
    raw?: unknown;
  }> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: input.temperature ?? 0.3,
      max_tokens: 400,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...this.toGroqMessages(input),
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Groq returned empty content");
    }

    return {
      text,
      raw: completion,
    };
  }

  async *streamGenerate(input: {
    systemPrompt: string;
    userPrompt: string;
    history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
  }): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      temperature: input.temperature ?? 0.3,
      max_tokens: 400,
      stream: true,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...this.toGroqMessages(input),
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
