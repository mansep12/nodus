import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface ConnectOptions {
  /** A Postgres connection string. Its schema is managed with `bun run migrate`. */
  url?: string;
  /** Where the embedded database stores its files; in memory when omitted. */
  dataDir?: string;
  /** Where the embedded database finds its migrations, for bundlers that relocate this module. */
  migrationsFolder?: string;
}

/**
 * Connects to the Postgres at `url`. Without one it starts an embedded
 * Postgres with the schema already applied, for development and tests.
 */
export async function connect({ url, dataDir, migrationsFolder }: ConnectOptions = {}): Promise<Db> {
  if (url) {
    // Supabase's connection pooler does not support prepared statements.
    return drizzlePostgres(postgres(url, { prepare: false }), { schema });
  }
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = drizzlePglite(new PGlite(dataDir), { schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder ?? MIGRATIONS_FOLDER });
  return db;
}
