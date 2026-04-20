export interface STTProvider {
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    language?: string;
  }): Promise<{
    text: string;
    durationSeconds?: number;
    raw?: unknown;
  }>;
}

export interface LLMProvider {
  generate(input: {
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
  }>;

  streamGenerate?(input: {
    systemPrompt: string;
    userPrompt: string;
    history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
  }): AsyncGenerator<string>;
}

export interface TTSProvider {
  synthesize(input: {
    text: string;
    voice?: string;
    format?: "wav" | "mp3" | "ogg";
    sampleRate?: number;
  }): Promise<{
    audio: Buffer;
    mimeType: string;
    raw?: unknown;
  }>;
}

export interface EmbeddingProvider {
  embed(input: { text: string }): Promise<{ embedding: number[]; raw?: unknown }>;
}
