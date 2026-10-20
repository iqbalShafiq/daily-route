import { defineConfig } from "vitest/config";

/**
 * The web app's unit tests.
 *
 * The end-to-end tests live in `e2e/` and are run by Playwright, not by
 * Vitest, so they are excluded here.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
  },
});
