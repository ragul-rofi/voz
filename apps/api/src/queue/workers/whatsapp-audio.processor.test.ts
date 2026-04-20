import { describe, expect, it, vi } from "vitest";

const resolveWhatsAppIdentityMock = vi.fn();
const fetchMediaBinaryMock = vi.fn();
const sendVoiceMessageMock = vi.fn();
const toWhatsappOpusOggMock = vi.fn();
const handleTurnMock = vi.fn();
const redisSetMock = vi.fn();

vi.mock("@/src/whatsapp/identity-resolver", () => ({
  resolveWhatsAppIdentity: resolveWhatsAppIdentityMock,
}));

vi.mock("@/src/whatsapp/meta-client", () => ({
  fetchMediaBinary: fetchMediaBinaryMock,
  sendVoiceMessage: sendVoiceMessageMock,
}));

vi.mock("@/src/audio/ffmpeg", () => ({
  toWhatsappOpusOgg: toWhatsappOpusOggMock,
}));

vi.mock("@/src/voice/container", () => ({
  createVoiceTurnManager: () => ({
    handleTurn: handleTurnMock,
  }),
}));

vi.mock("@/src/lib/redis", () => ({
  redis: {
    set: redisSetMock,
  },
}));

describe("processWhatsAppAudioJob", () => {
  it("processes media and sends voice response", async () => {
    resolveWhatsAppIdentityMock.mockResolvedValueOnce({
      studentId: "student-1",
      courseId: "22222222-2222-2222-2222-222222222222",
      sessionId: "33333333-3333-3333-3333-333333333333",
    });

    fetchMediaBinaryMock.mockResolvedValueOnce({
      data: Buffer.from("incoming-audio"),
      mimeType: "audio/ogg",
    });

    handleTurnMock.mockResolvedValueOnce({
      outputAudio: Buffer.from("reply-audio"),
      transcript: "hey",
      responseText: "hello",
      ttsMimeType: "audio/wav",
      cacheHit: false,
      ragChunksUsed: 1,
      latencyMs: 120,
    });

    toWhatsappOpusOggMock.mockResolvedValueOnce(Buffer.from("ogg-bytes"));
    redisSetMock.mockResolvedValueOnce("OK");

    const { processWhatsAppAudioJob } = await import("./whatsapp-audio.processor");

    await processWhatsAppAudioJob({
      messageId: "msg-1",
      mediaId: "media-1",
      from: "919999999999",
      phoneNumberId: "123",
      timestamp: String(Math.floor(Date.now() / 1000)),
    });

    expect(resolveWhatsAppIdentityMock).toHaveBeenCalledTimes(1);
    expect(fetchMediaBinaryMock).toHaveBeenCalledWith("media-1");
    expect(handleTurnMock).toHaveBeenCalledTimes(1);
    expect(sendVoiceMessageMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledWith("wa:processed:done:msg-1", "1", { ex: 86400 });
  });
});
