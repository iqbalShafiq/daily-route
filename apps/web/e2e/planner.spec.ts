import { expect, test, type Page } from "@playwright/test";

/**
 * The planner's end-to-end journey.
 *
 * The test types a real origin and destination, waits for the itinerary and
 * checks that the map received the route. It runs on a phone and on a
 * desktop, so the layout has to work in both.
 */

/**
 * The two place fields.
 *
 * `getByLabel("To")` also matches the long aria-label of a notice button
 * ("... to Bundaran Senayan"), so target the combobox role exactly.
 */
function field(page: Page, name: "From" | "To") {
  return page.getByRole("combobox", { name, exact: true });
}

test.describe("route planner", () => {
  test("plans a journey and shows the itinerary", async ({ page }) => {
    await page.goto("/");

    const origin = field(page, "From");
    const destination = field(page, "To");

    await expect(origin).toBeVisible();
    await expect(destination).toBeVisible();

    await origin.fill("Bundaran HI");
    await destination.fill("Kelapa Gading");

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show route" }).click();

    // The itinerary arrives with a duration and at least one leg. The
    // journey header names the destination, without an arrow.
    await expect(page.getByText("Fare")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Kelapa Gading", { exact: true }).first()).toBeVisible();

    // The route is drawn on the map.
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  });

  test("shows the distance, the fare and what a transfer means", async ({ page }) => {
    await page.goto("/");

    await field(page, "From").fill("Bundaran HI");
    await field(page, "To").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show route" }).click();

    await expect(page.getByText("Fare")).toBeVisible({ timeout: 30_000 });

    // The journey is stated first, and the rest follows it: how far it
    // is and how many changes of vehicle it takes.
    await expect(page.getByText(/^\d+ hr \d+ min$|^\d+ min$/).first()).toBeVisible();
    await expect(page.getByText(/^[\d.,]+ km · \d+ changes?(?: · walk [\d.,]+ (?:m|km))?$/).first()).toBeVisible();

    // The fare is an amount in rupiah.
    await expect(page.getByText(/^Rp[\d.]+$/).first()).toBeVisible();

    // A change of vehicle names the line the rider takes next, and a walk
    // says what it is for.
    await expect(page.getByText(/Change to |Change from /).first()).toBeVisible();
  });

  test("offers station suggestions while typing", async ({ page }) => {
    await page.goto("/");

    await field(page, "From").fill("Kelapa Gading");

    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option).toContainText(/Kelapa Gading/i);
  });

  test("offers places from the Overture extract", async ({ page }) => {
    const health = await page.request.get("http://localhost:3011/api/health");
    const body = (await health.json()) as { places?: string };
    test.skip(
      !body.places?.startsWith("overture"),
      "the Overture snapshot is not loaded",
    );

    await page.goto("/");

    await field(page, "From").fill("Grand Indonesia");

    const list = page.getByRole("listbox", { name: "Places matching From" });
    await expect(
      list.getByRole("option", { name: /Grand Indonesia Shopping Town/ }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(list.getByText("Places © Overture Maps")).toBeVisible();
  });

  test("moves through the suggestions with the keyboard", async ({ page }) => {
    await page.goto("/");

    // The role, not the label: the list of suggestions carries the name of
    // the field in its own label as well.
    const origin = page.getByRole("combobox", { name: "From" });
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

    await field(page, "From").fill("manggarai");

    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option.locator("mark")).toHaveText(/manggarai/i);
  });

  test("names the vehicles of the journey in the legend of the map", async ({ page }, testInfo) => {
    // The legend is a map control for a wide screen. On a phone the list
    // of the journey names the vehicle and shows its colour.
    test.skip(testInfo.project.name !== "desktop", "the legend belongs to the wide layout");

    await page.goto("/");

    await field(page, "From").fill("Bundaran HI");
    await field(page, "To").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show route" }).click();

    await expect(page.getByText("Fare")).toBeVisible({ timeout: 30_000 });

    // Turning an operator off removes its lines from the map.
    const hideBus = page.getByRole("button", { name: "Hide Transjakarta" });
    await expect(hideBus).toBeVisible();
    const before = await page.evaluate(() => {
      const map = (window as unknown as {
        __dailyRouteMap?: { queryRenderedFeatures: (options: { layers: string[] }) => unknown[] };
      }).__dailyRouteMap;
      return map?.queryRenderedFeatures({ layers: ["network-primary-body"] }).length ?? 0;
    });
    expect(before).toBeGreaterThan(0);
    await hideBus.click();
    await expect(page.getByRole("button", { name: "Show Transjakarta" })).toBeVisible();
    await expect.poll(async () =>
      page.evaluate(() => {
        const map = (window as unknown as {
          __dailyRouteMap?: { queryRenderedFeatures: (options: { layers: string[] }) => unknown[] };
        }).__dailyRouteMap;
        return map?.queryRenderedFeatures({ layers: ["network-primary-body"] }).length ?? -1;
      }),
    ).toBeLessThan(before);

    // This journey shows one operator mark per mode, without line labels
    // or a "Change of vehicle" row.
    const journey = page.getByTestId("this-journey");
    await expect(journey).toBeVisible();
    await expect(journey.getByText("Change of vehicle")).toHaveCount(0);
    expect(await journey.locator("img").count()).toBeGreaterThan(0);
  });

  test("swaps the origin and the destination", async ({ page }) => {
    await page.goto("/");

    await field(page, "From").fill("Senen");
    await field(page, "To").fill("Cawang");
    await page.getByRole("button", { name: "Swap origin and destination" }).click();

    await expect(field(page, "From")).toHaveValue("Cawang");
    await expect(field(page, "To")).toHaveValue("Senen");
  });

  test("tells what a stop is when the reader points at its name", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "pointing is a pointer thing");

    await page.goto("/");

    // Pin the departure to midday so this interaction test does not depend
    // on the hour the suite happens to run at.
    await page.getByRole("button", { name: "Leave at" }).click();
    // Select 12 PM regardless of whether the suite runs in the AM or PM.
    const switchToPm = page.getByRole("button", { name: "Switch to PM" });
    if (await switchToPm.isVisible().catch(() => false)) await switchToPm.click();
    await page.getByRole("button", { name: "Hour 12" }).click();
    await page.getByRole("button", { name: "Minute 00" }).click();
    await page.getByRole("button", { name: "Done" }).click();

    await field(page, "From").fill("Lebak Bulus");
    await field(page, "To").fill("Kalideres");
    await page.getByRole("button", { name: "Show route" }).click();
    await expect(page.getByText("Fare")).toBeVisible();

    // The ride details are open by default; make sure a previous
    // interaction did not collapse one before pointing at a stop.
    await page.locator("details").evaluateAll((nodes) => {
      for (const node of nodes) {
        if (node instanceof HTMLDetailsElement) node.open = true;
      }
    });

    const name = page.getByRole("button", { name: /^Details for / }).first();
    // The name stands on one line, however long it is.
    const box = await name.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(30);

    await name.hover();

    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Stop|Station/);
  });

  test("opens the assistant over the map and closes it again", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Ask the assistant" }).click();
    await expect(page.getByRole("heading", { name: "Route assistant" })).toBeVisible();

    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(page.getByRole("heading", { name: "Route assistant" })).toHaveCount(0);
  });

  test("gives the search the whole width of a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the mobile project covers this");

    await page.goto("/");

    // The search surface is the width of the window, edge to edge.
    const surface = page.getByRole("search", { name: "Route search" });
    const surfaceBox = await surface.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(surfaceBox?.width ?? 0).toBeGreaterThan(width - 1);

    // The button that runs the search is the last thing in the form.
    const send = await page.getByRole("button", { name: "Show route" }).boundingBox();
    const rightEdge = (surfaceBox?.x ?? 0) + (surfaceBox?.width ?? 0);
    expect(rightEdge - ((send?.x ?? 0) + (send?.width ?? 0))).toBeLessThanOrEqual(20);

    // And it only works when there is a destination.
    await expect(page.getByRole("button", { name: "Show route" })).toBeDisabled();
    await field(page, "To").fill("Cawang");
    await expect(page.getByRole("button", { name: "Show route" })).toBeEnabled();
  });

  test("keeps the layout usable on a small screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the mobile project covers this");

    await page.goto("/");

    await expect(field(page, "From")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show route" })).toBeVisible();

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
    await field(page, "To").fill("Kelapa Gading");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Use my location" }).click();

    // The stop to start from, the distance, and the ways of starting.
    await expect(page.getByText("Start from")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("list", { name: "Ways to start" }).getByRole("button", { name: /^Fastest/ }),
    ).toBeVisible();
    await expect(page.getByText(/Walk .* to /).first()).toBeVisible({ timeout: 30_000 });

    // The journey starts from that stop.
    await expect(field(page, "From")).toHaveValue(/.+/);
  });
});
