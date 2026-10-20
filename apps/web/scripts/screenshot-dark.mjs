import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3010/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  document.documentElement.dataset.theme = "dark";
  localStorage.setItem("daily-route-theme", "dark");
});
await page.getByLabel("Dari").fill("Dukuh Atas");
await page.getByLabel("Ke").fill("Cawang");
await page.getByRole("button", { name: "Tampilkan rute" }).click();
await page.getByText(/transfer/).first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: "../../research/screenshots/planner-dark.png" });
await browser.close();
console.log("✓ dark");
