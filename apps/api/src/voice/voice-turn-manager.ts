import { db, contentChunks, usageEvents, voiceSessions } from "@voz/db";
import { TranscriptTurnSchema, type TranscriptTurn } from "@voz/shared";
import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { redis } from "@/src/lib/redis";
import { logger } from "@/src/lib/logger";
import { incrementMetric } from "@/src/lib/telemetry";
import { withRetry, withTimeout } from "@/src/lib/retry";
import { env } from "@/src/env";
import { buildSystemPrompt } from "@/src/voice/prompt";
import type { VoiceTurnDependencies, VoiceTurnInput, VoiceTurnOutput } from "@/src/voice/types";

const CACHE_TTL_SECONDS = 60 * 10;
const MAX_RAG_CHUNKS = 5;
const ACTIVE_EMBEDDING_VERSION = env.RAG_EMBEDDING_VERSION;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class VoiceTurnManager {
  constructor(private readonly deps: VoiceTurnDependencies) {}

  private isTransientProviderError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("429") || msg.includes("rate") || msg.includes("503");
  }

  async handleTurn(input: VoiceTurnInput): Promise<VoiceTurnOutput> {
    const startedAt = Date.now();
    const audioBuffer = Buffer.from(input.audioBase64, "base64");

    const stt = await withRetry(
      () => withTimeout(this.deps.stt.transcribe({
        audio: audioBuffer,
        mimeType: input.mimeType,
        language: "en",
      }), env.PROVIDER_TIMEOUT_STT_MS, "stt provider"),
      {
        retries: env.VOICE_PIPELINE_MAX_RETRIES,
        baseDelayMs: 250,
        maxDelayMs: 1500,
        retryOn: (error) => this.isTransientProviderError(error),
      },
    );

    const transcript = stt.text.trim();
    if (!transcript) {
      throw new Error("Transcript was empty.");
    }

    const session = await db.query.voiceSessions.findFirst({
      where: eq(voiceSessions.id, input.sessionId),
    });

    const history = this.parseHistory(session?.transcriptHistory);
    const semanticCacheKey = this.semanticCacheKey({
      courseId: input.courseId,
      transcript,
      history,
    });

    const cached = await redis.get<{
      responseText: string;
      outputAudioBase64: string;
      ttsMimeType: string;
      ragChunksUsed: number;
    }>(semanticCacheKey);

    if (cached) {
      const latencyMs = Date.now() - startedAt;
      await this.appendSessionHistory(input.sessionId, history, transcript, cached.responseText);
      await this.recordUsage({
        sessionId: input.sessionId,
        studentId: input.studentId,
        courseId: input.courseId,
        eventType: "voice_turn_cache_hit",
        provider: "redis",
        model: "semantic-cache-v1",
        latencyMs,
      });

      return {
        transcript,
        responseText: cached.responseText,
        outputAudio: Buffer.from(cached.outputAudioBase64, "base64"),
        ttsMimeType: cached.ttsMimeType,
        cacheHit: true,
        ragChunksUsed: cached.ragChunksUsed,
        latencyMs,
      };
    }

    const embeddingResult = await withRetry(
      () => withTimeout(this.deps.embedding.embed({ text: transcript }), env.PROVIDER_TIMEOUT_EMBED_MS, "embedding provider"),
      {
        retries: env.VOICE_PIPELINE_MAX_RETRIES,
        baseDelayMs: 250,
        maxDelayMs: 1500,
        retryOn: (error) => this.isTransientProviderError(error),
      },
    );
    const rag = await this.retrieveRagContext(input.courseId, embeddingResult.embedding);
    const systemPrompt = buildSystemPrompt({ context: rag.map((r) => r.content), history });

    const llm = await withRetry(
      () => withTimeout(this.deps.llm.generate({
        systemPrompt,
        userPrompt: transcript,
        history: history.map((t) => ({ role: t.role, content: t.content })),
        temperature: 0.2,
      }), env.PROVIDER_TIMEOUT_LLM_MS, "llm provider"),
      {
        retries: env.VOICE_PIPELINE_MAX_RETRIES,
        baseDelayMs: 350,
        maxDelayMs: 2500,
        retryOn: (error) => this.isTransientProviderError(error),
      },
    );

    const tts = await withRetry(
      () => withTimeout(this.deps.tts.synthesize({
        text: llm.text,
        format: "wav",
        sampleRate: 24000,
      }), env.PROVIDER_TIMEOUT_TTS_MS, "tts provider"),
      {
        retries: env.VOICE_PIPELINE_MAX_RETRIES,
        baseDelayMs: 250,
        maxDelayMs: 2000,
        retryOn: (error) => this.isTransientProviderError(error),
      },
    );

    const latencyMs = Date.now() - startedAt;
    await redis.set(
      semanticCacheKey,
      {
        responseText: llm.text,
        outputAudioBase64: tts.audio.toString("base64"),
        ttsMimeType: tts.mimeType,
        ragChunksUsed: rag.length,
      },
      { ex: CACHE_TTL_SECONDS },
    );

    await this.appendSessionHistory(input.sessionId, history, transcript, llm.text);
    const usagePayload: {
      sessionId: string;
      studentId: string;
      courseId: string;
      eventType: string;
      provider: string;
      model: string;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
    } = {
      sessionId: input.sessionId,
      studentId: input.studentId,
      courseId: input.courseId,
      eventType: "voice_turn_completed",
      provider: "gemini-router",
      model: "gemini-primary-groq-fallback",
      latencyMs,
    };

    if (typeof llm.usage?.inputTokens === "number") {
      usagePayload.inputTokens = llm.usage.inputTokens;
    }
    if (typeof llm.usage?.outputTokens === "number") {
      usagePayload.outputTokens = llm.usage.outputTokens;
    }

    await this.recordUsage(usagePayload);
    await incrementMetric("pipeline.voice_turn.success");

    return {
      transcript,
      responseText: llm.text,
      outputAudio: tts.audio,
      ttsMimeType: tts.mimeType,
      cacheHit: false,
      ragChunksUsed: rag.length,
      latencyMs,
    };
  }

  private semanticCacheKey(input: {
    courseId: string;
    transcript: string;
    history: TranscriptTurn[];
  }): string {
    const historyTail = input.history.slice(-4).map((t) => `${t.role}:${t.content}`).join("|");
    return `voice:semantic:${input.courseId}:${sha256(`${input.transcript}|${historyTail}`)}`;
  }

  private parseHistory(value: unknown): TranscriptTurn[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const parsed = value
      .map((item) => TranscriptTurnSchema.safeParse(item))
      .filter((item) => item.success)
      .map((item) => item.data);

    return parsed;
  }

  private async retrieveRagContext(courseId: string, embedding: number[]) {
    const vectorLiteral = `[${embedding.join(",")}]`;

    const result = await db.execute(sql`
      SELECT id, text AS content
      FROM ${contentChunks}
      WHERE course_id = ${courseId}
        AND embedding IS NOT NULL
        AND embedding_status = 'ready'
        AND embedding_version = ${ACTIVE_EMBEDDING_VERSION}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${MAX_RAG_CHUNKS}
    `);

    return result.rows as Array<{ id: string; content: string }>;
  }

  private async appendSessionHistory(
    sessionId: string,
    priorHistory: TranscriptTurn[],
    userText: string,
    assistantText: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const nextHistory: TranscriptTurn[] = [
      ...priorHistory,
      { role: "user" as const, content: userText, timestamp: now },
      { role: "assistant" as const, content: assistantText, timestamp: now },
    ].slice(-30);

    await db
      .update(voiceSessions)
      .set({
        transcriptHistory: nextHistory,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(voiceSessions.id, sessionId));
  }

  private async recordUsage(input: {
    sessionId: string;
    studentId: string;
    courseId: string;
    eventType: string;
    provider: string;
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<void> {
    const usageInsert: {
      sessionId: string;
      studentId: string;
      courseId: string;
      eventType: string;
      provider: string;
      model: string;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
    } = {
      sessionId: input.sessionId,
      studentId: input.studentId,
      courseId: input.courseId,
      eventType: input.eventType,
      provider: input.provider,
      model: input.model,
      latencyMs: input.latencyMs,
    };

    if (typeof input.inputTokens === "number") {
      usageInsert.inputTokens = input.inputTokens;
    }
    if (typeof input.outputTokens === "number") {
      usageInsert.outputTokens = input.outputTokens;
    }

    await db.insert(usageEvents).values(usageInsert);

    logger.debug({ usage: input }, "usage event recorded");
  }
}
