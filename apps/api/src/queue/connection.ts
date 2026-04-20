import { Redis } from "ioredis";
import { env } from "@/src/env";

const redisUrl = new URL(env.REDIS_URL);

export const bullConnection = new Redis({
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: env.REDIS_TOKEN ? "default" : undefined,
  password: env.REDIS_TOKEN,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
});
