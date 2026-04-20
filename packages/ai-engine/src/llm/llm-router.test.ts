import { beforeEach, describe, expect, it, vi } from "vitest";

const geminiGenerate = vi.fn();
const groqGenerate = vi.fn();
const geminiStreamGenerate = vi.fn();
const groqStreamGenerate = vi.fn();

vi.mock("./gemini-flash.provider.js", () => {
  return {
    GeminiFlashProvider: class {
      generate = geminiGenerate;
      streamGenerate = geminiStreamGenerate;
    },
  };
});

vi.mock("./groq-llama.provider.js", () => {
  return {
    GroqLlamaProvider: class {
      generate = groqGenerate;
      streamGenerate = groqStreamGenerate;
    },
  };
});

describe("LLMRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses fallback when daily budget is exceeded", async () => {
    const { LLMRouter } = await import("./llm-router.js");

    const redis = {
      get: vi.fn().mockResolvedValue(1_000_000),
      incrby: vi.fn(),
      expire: vi.fn(),
    };

    groqGenerate.mockResolvedValueOnce({ text: "fallback" });

    const router = new LLMRouter({
      geminiApiKey: "g",
      groqApiKey: "x",
      redis: redis as never,
      geminiDailyTokenLimit: 10,
    });

    const result = await router.generate({
      systemPrompt: "system",
      userPrompt: "question",
      history: [],
    });

    expect(result.text).toBe("fallback");
    expect(groqGenerate).toHaveBeenCalledTimes(1);
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it("falls back on rate-limit like primary errors", async () => {
    const { LLMRouter } = await import("./llm-router.js");

    geminiGenerate.mockRejectedValueOnce(new Error("429 rate limit"));
    groqGenerate.mockResolvedValueOnce({ text: "fallback after 429" });

    const router = new LLMRouter({
      geminiApiKey: "g",
      groqApiKey: "x",
    });

    const result = await router.generate({
      systemPrompt: "system",
      userPrompt: "question",
      history: [],
    });

    expect(result.text).toBe("fallback after 429");
    expect(groqGenerate).toHaveBeenCalledTimes(1);
  });

  it("tracks usage on primary success", async () => {
    const { LLMRouter } = await import("./llm-router.js");

    const redis = {
      get: vi.fn().mockResolvedValue(0),
      incrby: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    };

    geminiGenerate.mockResolvedValueOnce({ text: "primary" });

    const router = new LLMRouter({
      geminiApiKey: "g",
      groqApiKey: "x",
      redis: redis as never,
      geminiDailyTokenLimit: 900000,
    });

    const result = await router.generate({
      systemPrompt: "system",
      userPrompt: "question",
      history: [{ role: "user", content: "hello" }],
    });

    expect(result.text).toBe("primary");
    expect(redis.incrby).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });
});
