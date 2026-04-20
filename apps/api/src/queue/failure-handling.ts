import { redis } from "@/src/lib/redis";
import { logger } from "@/src/lib/logger";
import { incrementMetric } from "@/src/lib/telemetry";

const DLQ_MAX_ITEMS = 2000;

export async function recordQueueFailure(input: {
  queue: string;
  jobId?: string;
  payload?: unknown;
  error: unknown;
}): Promise<void> {
  const key = `ops:dlq:${input.queue}`;
  const reason = input.error instanceof Error ? input.error.message : String(input.error);

  const entry = JSON.stringify({
    queue: input.queue,
    jobId: input.jobId,
    reason,
    payload: input.payload,
    at: new Date().toISOString(),
  });

  try {
    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, DLQ_MAX_ITEMS - 1);
    await incrementMetric(`queue.failure.${input.queue}`);
  } catch (error) {
    logger.error({ err: error, queue: input.queue, jobId: input.jobId }, "failed to record queue failure");
  }
}
