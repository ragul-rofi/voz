import { describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const handleTurnMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/src/voice/container", () => ({
  createVoiceTurnManager: () => ({
    handleTurn: handleTurnMock,
  }),
}));

vi.mock("@/src/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 100, resetSeconds: 60 }),
}));

vi.mock("@/src/lib/telemetry", () => ({
  incrementMetric: vi.fn().mockResolvedValue(undefined),
  recordDurationMetric: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/voice-turn", () => {
  it("returns 401 when user is not authenticated", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/voice-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns parsed response for valid request", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    handleTurnMock.mockResolvedValueOnce({
      transcript: "hello",
      responseText: "hi there",
      outputAudio: Buffer.from("audio"),
      ttsMimeType: "audio/wav",
      cacheHit: false,
      ragChunksUsed: 2,
      latencyMs: 123,
    });

    const { POST } = await import("./route");

    const req = new Request("http://localhost/api/voice-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: "11111111-1111-1111-1111-111111111111",
        courseId: "22222222-2222-2222-2222-222222222222",
        sessionId: "33333333-3333-3333-3333-333333333333",
        audioBase64: "aGVsbG8=",
        mimeType: "audio/webm",
        source: "web",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.transcript).toBe("hello");
    expect(body.responseText).toBe("hi there");
    expect(typeof body.outputAudioBase64).toBe("string");
    expect(handleTurnMock).toHaveBeenCalledTimes(1);
  });
});
