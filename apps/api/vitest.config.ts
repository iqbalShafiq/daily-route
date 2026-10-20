import { defineConfig } from "vitest/config";

/**
 * The API's integration tests run against the real Postgres instance.
 *
 * There is no database double: the point of these tests is that the schema,
 * the queries and the routing engine agree with each other, which a mock
 * could never show.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The tests share one database, so they run one file at a time.
    fileParallelism: false,
  },
});
