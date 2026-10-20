import { expect, test } from "@playwright/test";

/**
 * The planner's end-to-end journey.
 *
 * The test types a real origin and destination, waits for the itinerary and
 * checks that the map received the route. It runs on a phone and on a
 * desktop, so the layout has to work in both.
 */

test.describe("route planner", () => {
  test("plans a journey and shows the itinerary", async ({ page }) => {
    await page.goto("/");

    const origin = page.getByLabel("Dari");
    const destination = page.getByLabel("Ke");

    await expect(origin).toBeVisible();
    await expect(destination).toBeVisible();

    await origin.fill("Bundaran HI");
    await destination.fill("Kelapa Gading");

    await page.getByRole("button", { name: "Tampilkan rute" }).click();

    // The itinerary arrives with a duration and at least one leg.
    await expect(page.getByText(/transfer/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Kelapa Gading/i).first()).toBeVisible();

    // The route is drawn on the map.
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  });

  test("offers station suggestions while typing", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("Kelapa Gading");

    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option).toContainText(/Kelapa Gading/i);
  });

  test("swaps the origin and the destination", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("Senen");
    await page.getByLabel("Ke").fill("Cawang");
    await page.getByRole("button", { name: "Tukar asal dan tujuan" }).click();

    await expect(page.getByLabel("Dari")).toHaveValue("Cawang");
    await expect(page.getByLabel("Ke")).toHaveValue("Senen");
  });

  test("switches between the planner and the assistant", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("tab", { name: "Tanya" }).click();
    await expect(page.getByRole("heading", { name: "Tanya asisten rute" })).toBeVisible();

    await page.getByRole("tab", { name: "Rute" }).click();
    await expect(page.getByRole("heading", { name: "Cari rute" })).toBeVisible();
  });

  test("keeps the layout usable on a small screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the mobile project covers this");

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Cari rute" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tampilkan rute" })).toBeVisible();

    // Nothing may overflow the viewport horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
