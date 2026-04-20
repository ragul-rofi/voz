# VOZ v4.1 Pre-Funding Scaffold

Headless EdTech Voice AI agent scaffold with modular provider contracts, semantic caching, and async WhatsApp job processing.

## Monorepo Layout

- `apps/web`: Next.js 15 web client scaffold (Tailwind v4 + shadcn-style primitives)
- `apps/api`: Next.js 15 API/webhook service + Fastify WebSocket realtime server + BullMQ worker
- `packages/db`: Drizzle ORM schema + Neon client + pgvector migration
- `packages/shared`: Zod contracts + provider interfaces shared across apps

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Configure environment variables for `apps/api`:

   - `DATABASE_URL`
   - `REDIS_URL`
   - `REDIS_TOKEN`
   - `CLERK_SECRET_KEY`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `GOOGLE_AI_API_KEY`
   - `GROQ_API_KEY`
   - `OPENAI_API_KEY`
   - `KOKORO_API_URL`
   - `KOKORO_API_KEY`
   - `META_APP_SECRET`
   - `META_VERIFY_TOKEN`
   - `META_WABA_PHONE_NUMBER_ID`
   - `META_ACCESS_TOKEN`

   You can bootstrap quickly using templates:

   ```bash
   copy apps\api\.env.example apps\api\.env
   copy apps\web\.env.example apps\web\.env
   ```

3. Run development apps:

   ```bash
   pnpm dev
   ```

4. Run WhatsApp worker in a separate terminal:

   ```bash
   pnpm --filter @voz/api worker
   ```

5. Optionally run WebSocket realtime server:

   ```bash
   pnpm --filter @voz/api ws
   ```

## Production-Safe Startup Scripts

- Start individual services:
   - `pnpm start:api`
   - `pnpm start:web`
   - `pnpm start:worker`
   - `pnpm start:ws`
- Start full stack with shared lifecycle management:
   - `pnpm start:stack`
- Build first, then start full stack:
   - `pnpm start:stack:prod`

The worker validates `ffmpeg` availability on boot and fails fast if missing.

## Implemented Core Flows

- Strict type-safe contracts using Zod (`@voz/shared`)
- Voice turn orchestration (`VoiceTurnManager`) with:
  - Groq Whisper STT
  - OpenAI embeddings (`text-embedding-3-small`)
  - pgvector nearest-neighbor retrieval on `content_chunks.embedding`
   - Gemini LLM generation (primary) with Groq fallback routing
  - Kokoro TTS synthesis
  - Redis semantic cache before LLM execution
- RAG ingestion pipeline with version strategy:
   - `/api/rag/ingest` queues content ingestion jobs
   - Chunking with overlap (`RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`)
   - Embedding worker computes vectors and marks `embedding_status=ready`
   - `/api/rag/reembed` schedules course-scoped re-embedding by version
   - Retrieval isolates by `course_id` and active `embedding_version`
- WhatsApp webhook (`GET` verification + `POST` event ingestion)
- Idempotency via Redis key lock for `message.id`
- Immediate webhook acknowledgment and async queue handoff
- BullMQ worker pipeline:
  - Meta Lookaside media retrieval
  - Voice pipeline invocation
  - FFmpeg conversion to `audio/ogg; codecs=opus` at 16kHz
  - Native WhatsApp voice note send with `voice: true`
- SSRF guardrails for outbound webhook/media endpoints

## Notes

- Clerk protection is applied on `/api/voice-turn` via backend auth checks.
- Web app includes real microphone capture, upload/stream transport, and reply playback.

## RAG Worker Commands

- Start ingestion worker:
   - `pnpm --filter @voz/api worker:rag-ingest`
- Start embedding worker:
   - `pnpm --filter @voz/api worker:rag-embed`

## RAG API Examples

- Ingest content (authenticated):

   ```bash
   curl -X POST http://localhost:4000/api/rag/ingest \
      -H "Content-Type: application/json" \
      -d '{
         "courseId": "11111111-1111-1111-1111-111111111111",
         "moduleId": "module-1",
         "subject": "physics",
         "topic": "kinematics",
         "contentType": "text",
         "sourceRef": "chapter-1",
         "rawText": "Long source text...",
         "contentVersion": 1,
         "chunkVersion": 1,
         "embeddingVersion": 1,
         "embeddingModel": "text-embedding-3-small"
      }'
   ```

## Production Hardening

- Observability:
   - Structured request logs with `requestId` on API and WebSocket flows.
   - Redis-backed counters and duration buckets for voice/API/WS/queue events.
   - Queue failure entries are persisted to `ops:dlq:<queue>` for incident triage.
- Retry/backoff and failure handling:
   - BullMQ queues use exponential backoff and bounded retry attempts.
   - Voice pipeline providers (STT, embedding, LLM, TTS) are wrapped with timeout + retry guardrails.
   - Failed queue jobs increment failure metrics and are pushed to DLQ lists.
- Abuse/rate controls:
   - Voice-turn API rate limited by `userId + studentId + IP`.
   - Realtime WS voice flow rate limited by student identity.
   - RAG ingest/re-embed routes rate limited by authenticated user.

## Release And Ops (No CI Pipeline)

Manual pre-release checklist:
1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm --filter @voz/api test`
4. `pnpm --filter @voz/web test`
5. `pnpm --filter @voz/ai-engine test`
6. `pnpm db:migrate`
7. Start services and smoke verify:
    - `pnpm start:api`
    - `pnpm start:worker`
    - `pnpm --filter @voz/api start:worker:rag-ingest`
    - `pnpm --filter @voz/api start:worker:rag-embed`
    - `pnpm start:ws`
    - `pnpm start:web`

Manual rollback and incident runbook:
1. Stop workers first (WhatsApp + RAG ingest + RAG embed), then API/WS.
2. Revert deployment to last known good app artifact/config.
3. If schema change contributed, restore previous schema backup or run corrective migration.
4. Inspect queue DLQ keys: `ops:dlq:whatsapp-audio`, `ops:dlq:rag-ingest`, `ops:dlq:rag-embed`.
5. Reprocess failed jobs manually after fix by replaying payloads from DLQ.

- Re-embed a course with newer embedding version (authenticated):

   ```bash
   curl -X POST http://localhost:4000/api/rag/reembed \
      -H "Content-Type: application/json" \
      -d '{
         "courseId": "11111111-1111-1111-1111-111111111111",
         "embeddingVersion": 2,
         "embeddingModel": "text-embedding-3-small"
      }'
   ```
