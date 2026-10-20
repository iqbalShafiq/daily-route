import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Drop the schema so the next migration rebuilds it from scratch.
 *
 * `pnpm db:reset` is the destructive path: it removes every row and every
 * table, including anything an experiment left behind.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Run through `pnpm db:reset` so dotenv-cli loads the root .env.");
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  console.log("· dropping schema");
  await db.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await db.execute("CREATE EXTENSION IF NOT EXISTS vector");
  await db.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");

  console.log("✓ schema dropped. Run `pnpm db:migrate` then `pnpm db:seed`.");
  await client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error("reset failed:", error);
  process.exitCode = 1;
});
