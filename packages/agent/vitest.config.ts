import { defineConfig } from "vitest/config";

/**
 * The agent's tests run against the real database: the tools are only
 * meaningful when they answer from the data that is actually loaded.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
