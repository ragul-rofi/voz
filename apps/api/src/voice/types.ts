import type { EmbeddingProvider, LLMProvider, STTProvider, TTSProvider, TranscriptTurn } from "@voz/shared";

export interface VoiceTurnDependencies {
  stt: STTProvider;
  llm: LLMProvider;
  tts: TTSProvider;
  embedding: EmbeddingProvider;
}

export interface VoiceTurnInput {
  studentId: string;
  courseId: string;
  sessionId: string;
  audioBase64: string;
  mimeType: string;
  source: "web" | "whatsapp";
}

export interface VoiceTurnOutput {
  transcript: string;
  responseText: string;
  outputAudio: Buffer;
  ttsMimeType: string;
  cacheHit: boolean;
  ragChunksUsed: number;
  latencyMs: number;
}

export interface SessionState {
  history: TranscriptTurn[];
}
