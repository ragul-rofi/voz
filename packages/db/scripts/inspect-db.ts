import { config } from "dotenv";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

config({ path: resolve(process.cwd(), "../../apps/api/.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL missing");
}

const sql = neon(url);

const tables = await sql`
  select table_schema, table_name
  from information_schema.tables
  where table_schema = 'public'
  order by table_name
`;

let migrations: Array<{ id: number; hash: string; created_at: string }> = [];
try {
  migrations = await sql`
    select id, hash, created_at
    from __drizzle_migrations
    order by id
  `;
} catch {
  migrations = [];
}

const drizzleMetaTables = await sql`
  select table_schema, table_name
  from information_schema.tables
  where table_name ilike '%drizzle%'
  order by table_schema, table_name
`;

console.log("DB host:", new URL(url).host);
console.log("Public tables:", tables.map((t) => t.table_name));
console.log("Migrations:", migrations.length > 0 ? migrations : "<none>");
console.log("Drizzle meta tables:", drizzleMetaTables);
