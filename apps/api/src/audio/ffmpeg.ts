import { spawn } from "node:child_process";

export async function toWhatsappOpusOgg(input: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-c:a",
      "libopus",
      "-b:a",
      "24k",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "ogg",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => errors.push(chunk));

    ffmpeg.on("error", (err) => reject(err));
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(errors).toString("utf8")}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}
