import { redis } from "@/src/lib/redis";
import type { WhatsAppAudioJob } from "@/src/queue/jobs/types";
import { fetchMediaBinary, sendVoiceMessage } from "@/src/whatsapp/meta-client";
import { resolveWhatsAppIdentity } from "@/src/whatsapp/identity-resolver";
import { createVoiceTurnManager } from "@/src/voice/container";
import { toWhatsappOpusOgg } from "@/src/audio/ffmpeg";

const manager = createVoiceTurnManager();

export async function processWhatsAppAudioJob(jobData: WhatsAppAudioJob): Promise<void> {
  const identity = await resolveWhatsAppIdentity({
    from: jobData.from,
    messageTimestamp: jobData.timestamp,
  });

  const media = await fetchMediaBinary(jobData.mediaId);
  const response = await manager.handleTurn({
    studentId: identity.studentId,
    courseId: identity.courseId,
    sessionId: identity.sessionId,
    audioBase64: media.data.toString("base64"),
    mimeType: media.mimeType,
    source: "whatsapp",
  });

  const ogg = await toWhatsappOpusOgg(response.outputAudio);
  await sendVoiceMessage({
    to: jobData.from,
    phoneNumberId: jobData.phoneNumberId,
    audio: ogg,
    mimeType: "audio/ogg",
  });

  await redis.set(`wa:processed:done:${jobData.messageId}`, "1", {
    ex: 60 * 60 * 24,
  });
}
