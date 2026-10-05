/** Applies pending migrations to the Postgres at DATABASE_URL. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { MIGRATIONS_FOLDER } from "./index.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
await client.end();
console.log("Migrations applied");
