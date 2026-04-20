import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { VoiceTurnRequestSchema } from "@voz/shared";
import { createVoiceTurnManager } from "@/src/voice/container";
import { env } from "@/src/env";
import { logger } from "@/src/lib/logger";
import { enforceRateLimit } from "@/src/lib/rate-limit";
import { incrementMetric, recordDurationMetric } from "@/src/lib/telemetry";

const app = Fastify({ logger: false });
const manager = createVoiceTurnManager();

await app.register(websocket);

app.get("/ws/audio", { websocket: true }, (socket) => {
  socket.on("message", async (message) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    try {
      const parsed = VoiceTurnRequestSchema.parse(JSON.parse(message.toString("utf8")));

      const rl = await enforceRateLimit({
        key: `ws-audio:${parsed.studentId}`,
        limit: env.RATE_LIMIT_WS_MAX_REQUESTS,
        windowSeconds: env.RATE_LIMIT_WS_WINDOW_SECONDS,
      });

      if (!rl.allowed) {
        await incrementMetric("ws.voice_turn.rate_limited");
        socket.send(JSON.stringify({ ok: false, error: "Rate limit exceeded." }));
        return;
      }

      const result = await manager.handleTurn({
        studentId: parsed.studentId,
        courseId: parsed.courseId,
        sessionId: parsed.sessionId,
        audioBase64: parsed.audioBase64,
        mimeType: parsed.mimeType,
        source: parsed.source,
      });

      socket.send(
        JSON.stringify({
          ok: true,
          transcript: result.transcript,
          responseText: result.responseText,
          outputAudioBase64: result.outputAudio.toString("base64"),
          ttsMimeType: result.ttsMimeType,
          cacheHit: result.cacheHit,
          ragChunksUsed: result.ragChunksUsed,
          latencyMs: result.latencyMs,
        }),
      );

      const durationMs = Date.now() - startedAt;
      await incrementMetric("ws.voice_turn.success");
      await recordDurationMetric("ws.voice_turn.duration", durationMs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      const durationMs = Date.now() - startedAt;
      await incrementMetric("ws.voice_turn.failed");
      await recordDurationMetric("ws.voice_turn.failed.duration", durationMs);
      logger.error({ err: reason, requestId, durationMs }, "websocket voice turn failed");
      socket.send(JSON.stringify({ ok: false, error: reason }));
    }
  });
});

const port = Number(process.env.WS_PORT ?? 4010);
await app.listen({ port, host: "0.0.0.0" });
logger.info({ port }, "Realtime WebSocket server listening");
