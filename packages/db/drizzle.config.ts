import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * The URL comes from the environment, which `dotenv-cli` populates from the
 * single root `.env` before any script runs.
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgresql://dailyroute:dailyroute@localhost:5433/dailyroute",
  },
  strict: true,
  verbose: true,
});
