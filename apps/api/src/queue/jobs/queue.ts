import { Queue } from "bullmq";
import { bullConnection } from "@/src/queue/connection";
import { RAG_EMBED_QUEUE, RAG_INGEST_QUEUE, WHATSAPP_AUDIO_QUEUE } from "@/src/queue/constants";
import type { RagEmbedChunkJob, RagIngestDocumentJob, WhatsAppAudioJob } from "@/src/queue/jobs/types";

export const whatsappAudioQueue = new Queue<WhatsAppAudioJob>(WHATSAPP_AUDIO_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export const ragIngestQueue = new Queue<RagIngestDocumentJob>(RAG_INGEST_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export const ragEmbedQueue = new Queue<RagEmbedChunkJob>(RAG_EMBED_QUEUE, {
  connection: bullConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 10000 },
    attempts: 4,
    backoff: {
      type: "exponential",
      delay: 1500,
    },
  },
});
