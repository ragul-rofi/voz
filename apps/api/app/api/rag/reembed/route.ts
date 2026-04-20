import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, contentChunks } from "@voz/db";
import { logger } from "@/src/lib/logger";
import { enforceRateLimit } from "@/src/lib/rate-limit";
import { incrementMetric } from "@/src/lib/telemetry";
import { ragEmbedQueue } from "@/src/queue/jobs/queue";

const RATE_LIMIT_RAG_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_RAG_WINDOW_SECONDS ?? 60);
const RATE_LIMIT_RAG_MAX_REQUESTS = Number(process.env.RATE_LIMIT_RAG_MAX_REQUESTS ?? 10);

const ReembedRequestSchema = z.object({
  courseId: z.string().uuid(),
  embeddingVersion: z.number().int().positive(),
  embeddingModel: z.string().min(1).default("text-embedding-3-small"),
  contentVersion: z.number().int().positive().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    key: `rag-reembed:${userId}`,
    limit: RATE_LIMIT_RAG_MAX_REQUESTS,
    windowSeconds: RATE_LIMIT_RAG_WINDOW_SECONDS,
  });
  if (!rl.allowed) {
    await incrementMetric("api.rag_reembed.rate_limited");
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const payload = ReembedRequestSchema.parse(await req.json());
  const ingestionId = crypto.randomUUID();

  const rows = await db
    .select({
      id: contentChunks.id,
      text: contentChunks.text,
    })
    .from(contentChunks)
    .where(
      payload.contentVersion
        ? and(
            eq(contentChunks.courseId, payload.courseId),
            eq(contentChunks.contentVersion, payload.contentVersion),
          )
        : eq(contentChunks.courseId, payload.courseId),
    );

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No chunks found for the requested course." }, { status: 404 });
  }

  await Promise.all(
    rows.map((row) =>
      ragEmbedQueue.add(
        "reembed-chunk",
        {
          ingestionId,
          chunkId: row.id,
          courseId: payload.courseId,
          text: row.text,
          embeddingVersion: payload.embeddingVersion,
          embeddingModel: payload.embeddingModel,
        },
        {
          jobId: `reembed-${payload.embeddingVersion}-${row.id}`,
        },
      ),
    ),
  );

  logger.info({ requestId, userId, courseId: payload.courseId, queued: rows.length }, "rag re-embed queued");
  await incrementMetric("api.rag_reembed.queued");

  return NextResponse.json(
    {
      ok: true,
      ingestionId,
      queued: rows.length,
      embeddingVersion: payload.embeddingVersion,
    },
    { status: 202 },
  );
}
