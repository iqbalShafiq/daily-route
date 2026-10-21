import { chromium } from "@playwright/test";

/**
 * Capture the planner so the interface can be reviewed.
 *
 * Usage: node research/tools/screenshot.mjs [url] [output]
 */

const url = process.argv[2] ?? "http://localhost:3010/";
const output =
  process.argv[3] ?? new URL("../../../research/screenshots/planner.png", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(url, { waitUntil: "networkidle" });
await page.getByLabel("Dari").fill("Bundaran HI");
await page.getByLabel("Ke").fill("Kelapa Gading");
await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tampilkan rute" }).click();
await page.getByText("Perkiraan tarif").first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: output, fullPage: false });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(url, { waitUntil: "networkidle" });
await mobile.getByLabel("Dari").fill("Senen");
await mobile.getByLabel("Ke").fill("Cawang");
await mobile.getByRole("button", { name: "Tampilkan rute" }).click();
await mobile.getByText("Perkiraan tarif").first().waitFor({ timeout: 30_000 });
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: output.replace(/\.png$/, "-mobile.png") });

await browser.close();
console.log(`✓ ${output}`);
