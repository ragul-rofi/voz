import { redis } from "@/src/lib/redis";
import { logger } from "@/src/lib/logger";

function toSafeMetricName(name: string): string {
  return name.replace(/[^a-zA-Z0-9:_-]/g, "_");
}

export async function incrementMetric(name: string, count = 1): Promise<void> {
  const key = `metrics:counter:${toSafeMetricName(name)}`;
  try {
    await redis.incrby(key, count);
    await redis.expire(key, 60 * 60 * 24 * 14);
  } catch (error) {
    logger.debug({ err: error, metric: name }, "metric increment failed");
  }
}

export async function recordDurationMetric(name: string, durationMs: number): Promise<void> {
  const bucket =
    durationMs < 100 ? "lt_100ms" :
    durationMs < 250 ? "lt_250ms" :
    durationMs < 500 ? "lt_500ms" :
    durationMs < 1000 ? "lt_1000ms" :
    durationMs < 3000 ? "lt_3000ms" : "gte_3000ms";

  await incrementMetric(`${name}:${bucket}`);
}
