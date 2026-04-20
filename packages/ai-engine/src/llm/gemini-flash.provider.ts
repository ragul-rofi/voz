// File: packages/ai-engine/src/llm/gemini-flash.provider.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider } from "@voz/shared";

export interface GeminiFlashProviderOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

function toGeminiPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}): string {
  const lines: string[] = [
    `SYSTEM: ${input.systemPrompt}`,
    "",
  ];

  for (const message of input.history) {
    const role = message.role === "user" ? "STUDENT" : message.role.toUpperCase();
    lines.push(`${role}: ${message.content}`);
  }

  lines.push(`STUDENT: ${input.userPrompt}`);

  lines.push("AGENT:");
  return lines.join("\n");
}

export class GeminiFlashProvider implements LLMProvider {
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly ai: GoogleGenerativeAI;

  constructor(options: GeminiFlashProviderOptions) {
    this.ai = new GoogleGenerativeAI(options.apiKey);
    this.modelName = options.model ?? "gemini-1.5-flash";
    this.timeoutMs = options.timeoutMs ?? 5000;
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
    const model = this.ai.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: input.temperature ?? 0.3,
        maxOutputTokens: 400,
      },
    });

    const prompt = toGeminiPrompt(input);
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Gemini request timeout")), this.timeoutMs);
      }),
    ]);

    const text = result.response.text().trim();
    if (!text) {
      throw new Error("Gemini returned empty content");
    }

    return {
      text,
      raw: result,
    };
  }

  async *streamGenerate(input: {
    systemPrompt: string;
    userPrompt: string;
    history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
  }): AsyncGenerator<string> {
    const model = this.ai.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: input.temperature ?? 0.3,
        maxOutputTokens: 400,
      },
    });

    const prompt = toGeminiPrompt(input);
    const stream = await model.generateContentStream(prompt);

    for await (const chunk of stream.stream) {
      const token = chunk.text();
      if (token) {
        yield token;
      }
    }
  }
}
