import OpenAI from "openai";
import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, contentChunks } from "@voz/db";
import { logger } from "@/src/lib/logger";
import { bullConnection } from "@/src/queue/connection";
import { RAG_EMBED_QUEUE } from "@/src/queue/constants";
import type { RagEmbedChunkJob } from "@/src/queue/jobs/types";
import { recordQueueFailure } from "@/src/queue/failure-handling";
import { incrementMetric } from "@/src/lib/telemetry";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required for rag embedding worker.");
}

const openai = new OpenAI({ apiKey });

const worker = new Worker<RagEmbedChunkJob>(
  RAG_EMBED_QUEUE,
  async (job) => {
    const data = job.data;

    try {
      const response = await openai.embeddings.create({
        model: data.embeddingModel,
        input: data.text,
      });

      const vector = response.data[0]?.embedding;
      if (!vector) {
        throw new Error("Embedding response did not include a vector.");
      }

      await db.update(contentChunks)
        .set({
          embedding: vector,
          embeddingVersion: data.embeddingVersion,
          embeddingModel: data.embeddingModel,
          embeddingStatus: "ready",
        })
        .where(and(eq(contentChunks.id, data.chunkId), eq(contentChunks.courseId, data.courseId)));

      return { chunkId: data.chunkId };
    } catch (error) {
      await db.update(contentChunks)
        .set({ embeddingStatus: "failed" })
        .where(and(eq(contentChunks.id, data.chunkId), eq(contentChunks.courseId, data.courseId)));

      throw error;
    }
  },
  {
    connection: bullConnection,
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  void incrementMetric("queue.rag_embed.completed");
  logger.debug({ jobId: job.id }, "rag embed job completed");
});

worker.on("failed", (job, err) => {
  void incrementMetric("queue.rag_embed.failed");
  void recordQueueFailure({
    queue: RAG_EMBED_QUEUE,
    ...(job?.id ? { jobId: job.id } : {}),
    ...(job?.data ? { payload: job.data } : {}),
    error: err,
  });
  logger.error({ jobId: job?.id, err }, "rag embed job failed");
});

logger.info({ queue: RAG_EMBED_QUEUE }, "rag embedding worker started");
