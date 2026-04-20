import { spawnSync } from "node:child_process";

export function assertBinaryAvailable(binary: string): void {
  const result = spawnSync(binary, ["-version"], {
    encoding: "utf8",
    stdio: "ignore",
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `Required binary '${binary}' is not available in PATH. Ensure it is installed before starting this service.`,
    );
  }
}
