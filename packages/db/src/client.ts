import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

/**
 * Open a pooled Postgres connection and bind the schema to it.
 *
 * The caller owns the returned client and must close it when the process
 * ends; `disconnect` does that.
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {
      // Notices are noise in a container log.
    },
  });

  return drizzle(client, { schema, casing: "snake_case" });
}

/** Close the underlying pool. */
export async function disconnect(db: Database): Promise<void> {
  await db.$client.end({ timeout: 5 });
}
