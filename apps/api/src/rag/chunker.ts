export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function chunkText(input: string, options: ChunkingOptions = {}): string[] {
  const normalized = normalizeWhitespace(input);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const chunkSize = Math.max(40, options.chunkSize ?? 220);
  const overlap = Math.max(0, Math.min(chunkSize - 1, options.overlap ?? 40));
  const step = Math.max(1, chunkSize - overlap);

  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(words.length, start + chunkSize);
    const text = words.slice(start, end).join(" ").trim();
    if (text.length > 0) {
      chunks.push(text);
    }
    if (end >= words.length) {
      break;
    }
  }

  return chunks;
}
