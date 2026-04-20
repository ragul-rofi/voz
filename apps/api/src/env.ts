import { z } from "zod";

const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INSTITUTION_NAME: z.string().min(1),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),

  GOOGLE_AI_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  KOKORO_API_URL: z.string().url().optional(),
  KOKORO_FLY_URL: z.string().url().optional(),
  KOKORO_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),

  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_BUCKET: z.string().min(1),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().url(),

  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),

  RAG_CHUNK_SIZE: z.coerce.number().int().min(40).default(220),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().min(0).default(40),
  RAG_EMBEDDING_VERSION: z.coerce.number().int().min(1).default(1),
  RAG_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),

  RATE_LIMIT_VOICE_TURN_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_VOICE_TURN_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_WS_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_WS_MAX_REQUESTS: z.coerce.number().int().min(1).default(40),
  RATE_LIMIT_RAG_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_RAG_MAX_REQUESTS: z.coerce.number().int().min(1).default(10),

  VOICE_PIPELINE_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  PROVIDER_TIMEOUT_STT_MS: z.coerce.number().int().min(1000).default(15000),
  PROVIDER_TIMEOUT_EMBED_MS: z.coerce.number().int().min(1000).default(12000),
  PROVIDER_TIMEOUT_LLM_MS: z.coerce.number().int().min(1000).default(20000),
  PROVIDER_TIMEOUT_TTS_MS: z.coerce.number().int().min(1000).default(15000),

  // Legacy compatibility for existing in-repo code paths that are being retired.
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),

  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  META_WABA_PHONE_NUMBER_ID: z.string().min(1).optional(),
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_QUEUE_NAME: z.string().optional(),
}).transform((raw) => ({
  ...raw,
  CLERK_PUBLISHABLE_KEY:
    raw.CLERK_PUBLISHABLE_KEY ?? raw.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  REDIS_TOKEN: raw.REDIS_TOKEN ?? raw.UPSTASH_REDIS_REST_TOKEN ?? "",
  KOKORO_API_URL: raw.KOKORO_API_URL ?? raw.KOKORO_FLY_URL ?? "",
  WHATSAPP_QUEUE_NAME: raw.WHATSAPP_QUEUE_NAME ?? "whatsapp-audio",
}));

export type ApiEnv = z.output<typeof ApiEnvSchema>;

export const env: ApiEnv = ApiEnvSchema.parse(process.env);
