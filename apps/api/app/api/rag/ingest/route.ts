import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/src/lib/logger";
import { enforceRateLimit } from "@/src/lib/rate-limit";
import { incrementMetric } from "@/src/lib/telemetry";
import { ragIngestQueue } from "@/src/queue/jobs/queue";

const RATE_LIMIT_RAG_WINDOW_SECONDS = Number(process.env.RATE_LIMIT_RAG_WINDOW_SECONDS ?? 60);
const RATE_LIMIT_RAG_MAX_REQUESTS = Number(process.env.RATE_LIMIT_RAG_MAX_REQUESTS ?? 10);

const IngestRequestSchema = z.object({
  courseId: z.string().uuid(),
  moduleId: z.string().min(1),
  subject: z.string().min(1),
  topic: z.string().min(1),
  contentType: z.string().min(1).default("text"),
  sourceRef: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  rawText: z.string().min(50),
  contentVersion: z.number().int().positive().default(1),
  chunkVersion: z.number().int().positive().default(1),
  embeddingVersion: z.number().int().positive().default(1),
  embeddingModel: z.string().min(1).default("text-embedding-3-small"),
});

export async function POST(req: Request): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    key: `rag-ingest:${userId}`,
    limit: RATE_LIMIT_RAG_MAX_REQUESTS,
    windowSeconds: RATE_LIMIT_RAG_WINDOW_SECONDS,
  });
  if (!rl.allowed) {
    await incrementMetric("api.rag_ingest.rate_limited");
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const payload = IngestRequestSchema.parse(await req.json());
  const ingestionId = crypto.randomUUID();

  const jobPayload = {
    ingestionId,
    courseId: payload.courseId,
    moduleId: payload.moduleId,
    subject: payload.subject,
    topic: payload.topic,
    contentType: payload.contentType,
    rawText: payload.rawText,
    contentVersion: payload.contentVersion,
    chunkVersion: payload.chunkVersion,
    embeddingVersion: payload.embeddingVersion,
    embeddingModel: payload.embeddingModel,
    ...(payload.sourceRef ? { sourceRef: payload.sourceRef } : {}),
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
  };

  await ragIngestQueue.add(
    "ingest-document",
    jobPayload,
    {
      jobId: `rag-ingest-${ingestionId}`,
    },
  );

  logger.info({ requestId, userId, courseId: payload.courseId, ingestionId }, "rag ingestion queued");
  await incrementMetric("api.rag_ingest.queued");

  return NextResponse.json({ ok: true, ingestionId }, { status: 202 });
}
