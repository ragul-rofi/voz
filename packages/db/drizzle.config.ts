// File: packages/db/drizzle.config.ts

import { defineConfig } from "drizzle-kit";
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Load env files for local CLI usage when DATABASE_URL is not exported.
loadEnv({ path: resolve(here, "../../.env") });
loadEnv({ path: resolve(here, "../../apps/api/.env") });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
