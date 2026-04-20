import type { TTSProvider } from "@voz/shared";
import { env } from "@/src/env";

export class KokoroTTSProvider implements TTSProvider {
  async synthesize(input: {
    text: string;
    voice?: string;
    format?: "wav" | "mp3" | "ogg";
    sampleRate?: number;
  }): Promise<{ audio: Buffer; mimeType: string; raw?: unknown }> {
    const response = await fetch(`${env.KOKORO_API_URL}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.KOKORO_API_KEY}`,
      },
      body: JSON.stringify({
        model: "kokoro-82m",
        input: input.text,
        voice: input.voice ?? "alloy",
        format: input.format ?? "wav",
        sample_rate: input.sampleRate ?? 24000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kokoro TTS failed with ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      mimeType: `audio/${input.format ?? "wav"}`,
    };
  }
}
