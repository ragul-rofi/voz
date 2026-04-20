import { z } from "zod";

export const SharedEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type SharedEnv = z.infer<typeof SharedEnvSchema>;

export function parseSharedEnv(input: Record<string, string | undefined>): SharedEnv {
  return SharedEnvSchema.parse(input);
}
