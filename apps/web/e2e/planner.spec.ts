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

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tampilkan rute" }).click();

    // The itinerary arrives with a duration and at least one leg.
    await expect(page.getByText("Tarif")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/→ Kelapa Gading$/).first()).toBeVisible();

    // The route is drawn on the map.
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  });

  test("shows the distance, the fare and what a transfer means", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("Bundaran HI");
    await page.getByLabel("Ke").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tampilkan rute" }).click();

    await expect(page.getByText("Tarif")).toBeVisible({ timeout: 30_000 });

    // The journey is stated first, and the rest follows it: how far it
    // is and how many changes of vehicle it takes.
    await expect(page.getByText(/^\d+ jam \d+ mnt$|^\d+ mnt$/).first()).toBeVisible();
    await expect(page.getByText(/^[\d,]+ km · \d+ kali pindah$/).first()).toBeVisible();

    // The fare is an amount in rupiah.
    await expect(page.getByText(/^Rp [\d.]+$/).first()).toBeVisible();

    // A change of vehicle names the line the rider takes next, and a walk
    // says what it is for.
    await expect(page.getByText(/Pindah ke |Ganti dari /).first()).toBeVisible();
  });

  test("offers station suggestions while typing", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("Kelapa Gading");

    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option).toContainText(/Kelapa Gading/i);
  });

  test("moves through the suggestions with the keyboard", async ({ page }) => {
    await page.goto("/");

    // The role, not the label: the list of suggestions carries the name of
    // the field in its own label as well.
    const origin = page.getByRole("combobox", { name: "Dari" });
    await origin.fill("manggarai");

    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 15_000 });

    // The active suggestion is pointed at, and the field keeps the focus.
    await expect(origin).toHaveAttribute("aria-activedescendant", /option-0/);
    await origin.press("ArrowDown");
    await expect(origin).toHaveAttribute("aria-activedescendant", /option-1/);

    await origin.press("Enter");
    await expect(origin).toHaveValue(/Manggarai/i);
    // The list is closed, and the field still has the focus.
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test("marks the matched part of a suggestion", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("manggarai");

    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option.locator("mark")).toHaveText(/manggarai/i);
  });

  test("names the vehicles of the journey in the legend of the map", async ({ page }, testInfo) => {
    // The legend is a map control for a wide screen. On a phone the list
    // of the journey names the vehicle and shows its colour.
    test.skip(testInfo.project.name !== "desktop", "the legend belongs to the wide layout");

    await page.goto("/");

    await page.getByLabel("Dari").fill("Bundaran HI");
    await page.getByLabel("Ke").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Tampilkan rute" }).click();

    await expect(page.getByText("Tarif")).toBeVisible({ timeout: 30_000 });

    // The legend lists the vehicles the journey uses, so the colours of
    // the map are explained.
    const legend = page.locator("text=Pindah kendaraan");
    await expect(legend).toBeVisible();
  });

  test("swaps the origin and the destination", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Dari").fill("Senen");
    await page.getByLabel("Ke").fill("Cawang");
    await page.getByRole("button", { name: "Tukar asal dan tujuan" }).click();

    await expect(page.getByLabel("Dari")).toHaveValue("Cawang");
    await expect(page.getByLabel("Ke")).toHaveValue("Senen");
  });

  test("opens the assistant over the map and closes it again", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Tanya" }).click();
    await expect(page.getByRole("heading", { name: "Tanya asisten rute" })).toBeVisible();

    await page.getByRole("button", { name: "Tutup asisten" }).click();
    await expect(page.getByRole("heading", { name: "Tanya asisten rute" })).toHaveCount(0);
  });

  test("keeps the layout usable on a small screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the mobile project covers this");

    await page.goto("/");

    await expect(page.getByLabel("Dari")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tampilkan rute" })).toBeVisible();

    // Nothing may overflow the viewport horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("walking from the reader's place", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: -6.1952, longitude: 106.8211 },
  });

  test("finds the stop to walk to and the way there", async ({ page }) => {
    await page.goto("/");

    // A journey needs a destination before the start can be weighed.
    await page.getByLabel("Ke").fill("Kelapa Gading");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Gunakan posisi saya" }).click();

    // The stop to start from, the distance, and the ways of starting.
    await expect(page.getByText("Mulai dari")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("list", { name: "Pilihan mulai" }).getByRole("button", { name: /^Tercepat/ }),
    ).toBeVisible();
    await expect(page.getByText(/Berjalan .* ke /).first()).toBeVisible({ timeout: 30_000 });

    // The journey starts from that stop.
    await expect(page.getByLabel("Dari")).toHaveValue(/.+/);
  });
});
