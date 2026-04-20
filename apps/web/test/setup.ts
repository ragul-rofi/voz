import { vi } from "vitest";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => "00000000-0000-0000-0000-000000000001",
    },
  });
}

if (!URL.createObjectURL) {
  Object.defineProperty(URL, "createObjectURL", {
    value: () => "blob:test-url",
  });
}

Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
