import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

config({ path: resolve(process.cwd(), "../../apps/api/.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL missing");
}

const sql = neon(databaseUrl);
const migrationPath = resolve(process.cwd(), "drizzle/0001_cleanup_legacy_tables.sql");
const migrationSql = await readFile(migrationPath, "utf8");

const sanitizedSql = migrationSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = sanitizedSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of statements) {
  await sql(statement);
}

console.log("Applied cleanup migration on:", new URL(databaseUrl).host);
