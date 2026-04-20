import { createHash } from "node:crypto";
import { Worker } from "bullmq";
import { db, contentChunks } from "@voz/db";
import { logger } from "@/src/lib/logger";
import { env } from "@/src/env";
import { bullConnection } from "@/src/queue/connection";
import { RAG_INGEST_QUEUE } from "@/src/queue/constants";
import { ragEmbedQueue } from "@/src/queue/jobs/queue";
import type { RagEmbedChunkJob, RagIngestDocumentJob } from "@/src/queue/jobs/types";
import { chunkText } from "@/src/rag/chunker";
import { recordQueueFailure } from "@/src/queue/failure-handling";
import { incrementMetric } from "@/src/lib/telemetry";

const chunkSize = env.RAG_CHUNK_SIZE;
const overlap = env.RAG_CHUNK_OVERLAP;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const worker = new Worker<RagIngestDocumentJob>(
  RAG_INGEST_QUEUE,
  async (job) => {
    const data = job.data;
    const chunks = chunkText(data.rawText, { chunkSize, overlap });

    if (chunks.length === 0) {
      throw new Error("No chunks generated from provided content.");
    }

    logger.info(
      { ingestionId: data.ingestionId, chunks: chunks.length, courseId: data.courseId },
      "starting rag ingestion",
    );

    let enqueued = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (!chunk) {
        continue;
      }
      const sourceHash = sha256(
        `${data.courseId}|${data.sourceRef ?? "inline"}|${data.contentVersion}|${data.chunkVersion}|${index}|${chunk}`,
      );

      const values = {
        courseId: data.courseId,
        moduleId: data.moduleId,
        topic: data.topic,
        subject: data.subject,
        contentType: data.contentType,
        text: chunk,
        chunkIndex: index,
        chunkVersion: data.chunkVersion,
        contentVersion: data.contentVersion,
        embeddingModel: data.embeddingModel,
        embeddingVersion: data.embeddingVersion,
        embeddingStatus: "pending",
        sourceHash,
        ingestedAt: new Date(),
        createdAt: new Date(),
        ...(data.sourceRef ? { sourceRef: data.sourceRef } : {}),
        ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
      };

      const inserted = await db.insert(contentChunks).values(values).onConflictDoUpdate({
        target: [contentChunks.courseId, contentChunks.sourceHash, contentChunks.chunkVersion],
        set: {
          moduleId: data.moduleId,
          topic: data.topic,
          subject: data.subject,
          contentType: data.contentType,
          text: chunk,
          chunkIndex: index,
          contentVersion: data.contentVersion,
          embeddingModel: data.embeddingModel,
          embeddingVersion: data.embeddingVersion,
          embeddingStatus: "pending",
          ingestedAt: new Date(),
          createdAt: new Date(),
          ...(data.sourceRef ? { sourceRef: data.sourceRef } : {}),
          ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
        },
      }).returning({ id: contentChunks.id, text: contentChunks.text });

      const row = inserted[0];
      if (!row) {
        continue;
      }

      const embedJob: RagEmbedChunkJob = {
        ingestionId: data.ingestionId,
        chunkId: row.id,
        courseId: data.courseId,
        text: row.text,
        embeddingVersion: data.embeddingVersion,
        embeddingModel: data.embeddingModel,
      };

      await ragEmbedQueue.add("embed-chunk", embedJob, {
        jobId: `embed-${data.ingestionId}-${row.id}`,
      });
      enqueued += 1;
    }

    logger.info(
      { ingestionId: data.ingestionId, enqueued, courseId: data.courseId },
      "rag ingestion completed and embedding jobs queued",
    );

    return { enqueued };
  },
  {
    connection: bullConnection,
    concurrency: 2,
  },
);

worker.on("failed", (job, err) => {
  void incrementMetric("queue.rag_ingest.failed");
  void recordQueueFailure({
    queue: RAG_INGEST_QUEUE,
    ...(job?.id ? { jobId: job.id } : {}),
    ...(job?.data ? { payload: job.data } : {}),
    error: err,
  });
  logger.error({ jobId: job?.id, err }, "rag ingestion job failed");
});

logger.info({ queue: RAG_INGEST_QUEUE }, "rag ingestion worker started");
