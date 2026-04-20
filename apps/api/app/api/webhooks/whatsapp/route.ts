import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { WhatsAppWebhookEnvelopeSchema } from "@voz/shared";
import { env } from "@/src/env";
import { redis } from "@/src/lib/redis";
import { logger } from "@/src/lib/logger";
import { whatsappAudioQueue } from "@/src/queue/jobs/queue";

function verifyMetaSignature(signature: string | null, body: string): boolean {
  if (!env.META_APP_SECRET) {
    return false;
  }

  if (!signature) {
    return false;
  }

  const [scheme, value] = signature.split("=");
  if (scheme !== "sha256" || !value) {
    return false;
  }

  const expected = createHmac("sha256", env.META_APP_SECRET).update(body).digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(value, "hex");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: Request): Promise<Response> {
  if (!env.META_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Webhook verification is not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(signature, rawBody)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload = WhatsAppWebhookEnvelopeSchema.parse(JSON.parse(rawBody));

  const jobs: Promise<unknown>[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const phoneNumberId = change.value.metadata?.phone_number_id ?? env.META_WABA_PHONE_NUMBER_ID;
      if (!phoneNumberId) {
        logger.warn("Skipping WhatsApp message: missing phone_number_id and META_WABA_PHONE_NUMBER_ID");
        continue;
      }

      const messages = change.value.messages ?? [];

      for (const message of messages) {
        if (message.type !== "audio" || !message.audio?.id) {
          continue;
        }

        const idempotencyKey = `wa:processed:${message.id}`;
        const lockAcquired = await redis.set(idempotencyKey, "1", {
          nx: true,
          ex: 60 * 60 * 24,
        });

        if (!lockAcquired) {
          logger.info({ messageId: message.id }, "duplicate whatsapp webhook ignored");
          continue;
        }

        jobs.push(
          whatsappAudioQueue.add(
            "process-audio",
            {
              messageId: message.id,
              mediaId: message.audio.id,
              from: message.from,
              timestamp: message.timestamp,
              phoneNumberId,
            },
            {
              jobId: `wa-${message.id}`,
            },
          ),
        );
      }
    }
  }

  await Promise.allSettled(jobs);
  return NextResponse.json({ ok: true }, { status: 200 });
}
