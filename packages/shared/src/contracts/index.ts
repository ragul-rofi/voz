import { z } from "zod";

export const RoleSchema = z.enum(["system", "user", "assistant"]);

export const TranscriptTurnSchema = z.object({
  role: RoleSchema,
  content: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const VoiceTurnRequestSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  sessionId: z.string().uuid(),
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  source: z.enum(["web", "whatsapp"]).default("web"),
  messageId: z.string().optional(),
});

export const VoiceTurnResponseSchema = z.object({
  transcript: z.string().min(1),
  responseText: z.string().min(1),
  outputAudioBase64: z.string().min(1),
  ttsMimeType: z.string().min(1),
  cacheHit: z.boolean(),
  ragChunksUsed: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export const WhatsAppWebhookEnvelopeSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z
              .object({
                display_phone_number: z.string().optional(),
                phone_number_id: z.string().optional(),
              })
              .optional(),
            contacts: z.array(z.unknown()).optional(),
            messages: z
              .array(
                z.object({
                  id: z.string(),
                  from: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  audio: z
                    .object({
                      id: z.string(),
                      mime_type: z.string().optional(),
                      sha256: z.string().optional(),
                      voice: z.boolean().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
export type VoiceTurnRequest = z.infer<typeof VoiceTurnRequestSchema>;
export type VoiceTurnResponse = z.infer<typeof VoiceTurnResponseSchema>;
export type WhatsAppWebhookEnvelope = z.infer<typeof WhatsAppWebhookEnvelopeSchema>;

export * from "./providers.js";
