import { VoiceTurnManager } from "@/src/voice/voice-turn-manager";
import { GroqWhisperSTTProvider } from "@/src/voice/providers/groq-stt.provider";
import { KokoroTTSProvider } from "@/src/voice/providers/kokoro-tts.provider";
import { OpenAIEmbeddingProvider } from "@/src/voice/providers/openai-embedding.provider";
import { LLMRouter } from "@voz/ai-engine/llm";
import { redis } from "@/src/lib/redis";
import { env } from "@/src/env";

export function createVoiceTurnManager(): VoiceTurnManager {
  const router = new LLMRouter({
    geminiApiKey: env.GOOGLE_AI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    redis,
  });

  return new VoiceTurnManager({
    stt: new GroqWhisperSTTProvider(),
    llm: router,
    tts: new KokoroTTSProvider(),
    embedding: new OpenAIEmbeddingProvider(),
  });
}
