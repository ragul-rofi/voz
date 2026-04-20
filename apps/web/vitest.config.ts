import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    globals: true,
  },
});
