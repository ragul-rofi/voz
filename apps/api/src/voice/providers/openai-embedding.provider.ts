import type { EmbeddingProvider } from "@voz/shared";
import OpenAI from "openai";
import { env } from "@/src/env";

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed(input: { text: string }): Promise<{ embedding: number[]; raw?: unknown }> {
    const embedding = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: input.text,
    });

    const vector = embedding.data[0]?.embedding;
    if (!vector) {
      throw new Error("Embedding API returned empty vector.");
    }

    return { embedding: vector, raw: embedding };
  }
}
