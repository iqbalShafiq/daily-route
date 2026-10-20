import { defineConfig } from "vitest/config";

/**
 * The database tests run against the real database: the integrity of the
 * seeded network is the thing they check.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
