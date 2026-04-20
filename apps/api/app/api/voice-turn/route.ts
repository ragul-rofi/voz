import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { VoiceTurnRequestSchema, VoiceTurnResponseSchema } from "@voz/shared";
import { createVoiceTurnManager } from "@/src/voice/container";
import { logger } from "@/src/lib/logger";
import { enforceRateLimit } from "@/src/lib/rate-limit";
import { incrementMetric, recordDurationMetric } from "@/src/lib/telemetry";

const manager = createVoiceTurnManager();
const MAX_AUDIO_BASE64_LENGTH = 12_000_000;
const RATE_LIMIT_VOICE_TURN_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_VOICE_TURN_WINDOW_SECONDS ?? 60);
const RATE_LIMIT_VOICE_TURN_MAX_REQUESTS = Number(process.env.RATE_LIMIT_VOICE_TURN_MAX_REQUESTS ?? 30);

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const routeLogger = logger.child({ requestId, route: "/api/voice-turn" });

  const { userId } = await auth();
  if (!userId) {
    await incrementMetric("api.voice_turn.unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await req.json();
    const payload = VoiceTurnRequestSchema.parse(json);

    if (payload.audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      await incrementMetric("api.voice_turn.payload_too_large");
      return NextResponse.json({ error: "Audio payload too large." }, { status: 413 });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await enforceRateLimit({
      key: `voice-turn:${userId}:${payload.studentId}:${clientIp}`,
      limit: RATE_LIMIT_VOICE_TURN_MAX_REQUESTS,
      windowSeconds: RATE_LIMIT_VOICE_TURN_WINDOW_SECONDS,
    });

    if (!rl.allowed) {
      await incrementMetric("api.voice_turn.rate_limited");
      return NextResponse.json(
        {
          error: "Rate limit exceeded.",
          resetSeconds: rl.resetSeconds,
        },
        { status: 429 },
      );
    }

    const turn = await manager.handleTurn({
      studentId: payload.studentId,
      courseId: payload.courseId,
      sessionId: payload.sessionId,
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType,
      source: payload.source,
    });

    const response = VoiceTurnResponseSchema.parse({
      transcript: turn.transcript,
      responseText: turn.responseText,
      outputAudioBase64: turn.outputAudio.toString("base64"),
      ttsMimeType: turn.ttsMimeType,
      cacheHit: turn.cacheHit,
      ragChunksUsed: turn.ragChunksUsed,
      latencyMs: turn.latencyMs,
    });

    const durationMs = Date.now() - startedAt;
    await incrementMetric("api.voice_turn.success");
    await recordDurationMetric("api.voice_turn.duration", durationMs);

    routeLogger.info({
      userId,
      studentId: payload.studentId,
      courseId: payload.courseId,
      durationMs,
      cacheHit: turn.cacheHit,
      ragChunksUsed: turn.ragChunksUsed,
    }, "voice turn handled");

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    const durationMs = Date.now() - startedAt;
    await incrementMetric("api.voice_turn.failed");
    await recordDurationMetric("api.voice_turn.failed.duration", durationMs);

    routeLogger.error({ err: reason, durationMs }, "voice turn request failed");
    return NextResponse.json({ error: "Voice turn failed", requestId }, { status: 500 });
  }
}
