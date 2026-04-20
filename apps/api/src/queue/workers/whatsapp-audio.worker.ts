import { Worker } from "bullmq";
import { env } from "@/src/env";
import { logger } from "@/src/lib/logger";
import { bullConnection } from "@/src/queue/connection";
import { WHATSAPP_AUDIO_QUEUE } from "@/src/queue/constants";
import type { WhatsAppAudioJob } from "@/src/queue/jobs/types";
import { assertBinaryAvailable } from "@/src/bootstrap/assert-runtime";
import { recordQueueFailure } from "@/src/queue/failure-handling";
import { incrementMetric } from "@/src/lib/telemetry";
import { processWhatsAppAudioJob } from "@/src/queue/workers/whatsapp-audio.processor";

assertBinaryAvailable("ffmpeg");

const worker = new Worker<WhatsAppAudioJob>(
  WHATSAPP_AUDIO_QUEUE,
  async (job) => {
    logger.info({ jobId: job.id, messageId: job.data.messageId }, "processing whatsapp audio job");
    await processWhatsAppAudioJob(job.data);

    logger.info({ messageId: job.data.messageId }, "whatsapp message processed successfully");
  },
  {
    connection: bullConnection,
    concurrency: 10,
  },
);

worker.on("completed", (job) => {
  void incrementMetric("queue.whatsapp_audio.completed");
  logger.debug({ jobId: job.id }, "whatsapp worker job completed");
});

worker.on("failed", (job, err) => {
  void incrementMetric("queue.whatsapp_audio.failed");
  void recordQueueFailure({
    queue: WHATSAPP_AUDIO_QUEUE,
    ...(job?.id ? { jobId: job.id } : {}),
    ...(job?.data ? { payload: job.data } : {}),
    error: err,
  });
  logger.error({ jobId: job?.id, err }, "whatsapp worker job failed");
});

logger.info({ queue: WHATSAPP_AUDIO_QUEUE, env: env.NODE_ENV }, "whatsapp worker started");
