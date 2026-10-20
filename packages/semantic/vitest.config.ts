import { defineConfig } from "vitest/config";

/**
 * The semantic package's tests run against the real database, because the
 * resolver's quality depends on the data that is actually in it.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
