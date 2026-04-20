import { redis } from "@/src/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function enforceRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const scopedKey = `ratelimit:${input.key}`;
  const current = await redis.incr(scopedKey);

  if (current === 1) {
    await redis.expire(scopedKey, input.windowSeconds);
  }

  return {
    allowed: current <= input.limit,
    remaining: Math.max(0, input.limit - current),
    resetSeconds: input.windowSeconds,
  };
}
