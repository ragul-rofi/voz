import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt";

describe("buildSystemPrompt", () => {
  it("embeds RAG context lines in order", () => {
    const output = buildSystemPrompt({
      context: ["Newton's first law", "Inertia resists change"],
      history: [],
    });

    expect(output).toContain("[RAG 1] Newton's first law");
    expect(output).toContain("[RAG 2] Inertia resists change");
    expect(output).toContain("Socratic tutor");
  });

  it("uses fallback message when no context is available", () => {
    const output = buildSystemPrompt({ context: [], history: [] });
    expect(output).toContain("No course context found.");
  });
});
