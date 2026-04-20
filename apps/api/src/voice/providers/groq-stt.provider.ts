import type { STTProvider } from "@voz/shared";
import { env } from "@/src/env";

export class GroqWhisperSTTProvider implements STTProvider {
  async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    language?: string;
  }): Promise<{ text: string; durationSeconds?: number; raw?: unknown }> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(input.audio)], { type: input.mimeType }), "audio.webm");
    form.append("model", "whisper-large-v3");
    if (input.language) {
      form.append("language", input.language);
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Groq STT failed with ${response.status}`);
    }

    const payload = (await response.json()) as { text?: string; duration?: number };

    if (!payload.text) {
      throw new Error("Groq STT response did not include text.");
    }

    const result: { text: string; durationSeconds?: number; raw?: unknown } = {
      text: payload.text,
      raw: payload,
    };

    if (typeof payload.duration === "number") {
      result.durationSeconds = payload.duration;
    }

    return result;
  }
}
