import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The end-to-end tests.
 *
 * They drive the real application: the real API, the real database and the
 * real map. Both servers are started by Playwright, so a test run needs
 * nothing but the repository and the database.
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const API_URL = "http://localhost:3011";
const WEB_URL = "http://localhost:3010";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "en-GB",
    timezoneId: "Asia/Jakarta",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // A Chromium-based phone profile: one browser download covers both projects.
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @daily-route/api start",
      cwd: repoRoot,
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: "pnpm --filter @daily-route/web dev",
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
