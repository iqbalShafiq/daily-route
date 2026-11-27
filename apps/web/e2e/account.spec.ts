import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * The account, its named places and the place the rider is standing on.
 *
 * The same tests drive a phone and a desktop. The account is reached from
 * Saya, and the planner is checked without an account first: signing in is
 * an addition, not a gate.
 */

const PASSWORD = "correct-horse";

function field(page: Page, name: "Dari" | "Ke") {
  return page.getByRole("combobox", { name, exact: true });
}

function newEmail(testInfo: TestInfo): string {
  return `e2e.${testInfo.project.name}.${Date.now()}@example.test`;
}

async function openSaya(page: Page): Promise<void> {
  const nav = page.locator('nav[aria-label="Navigasi utama"]');
  await nav.locator("button:visible", { hasText: "Saya" }).first().click();
  await expect(page.getByRole("heading", { name: "Saya" })).toBeVisible();
}

async function openAuth(page: Page): Promise<void> {
  await openSaya(page);
  await page.getByRole("button", { name: "Masuk", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Halo, komuter." })).toBeVisible();
}

async function createAccount(page: Page, email: string): Promise<void> {
  await openAuth(page);
  await page.getByRole("radio", { name: "Buat akun" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Ulangi kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Buka pengaturan" }).click();
  await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();
}

async function openPlaces(page: Page): Promise<void> {
  if (await page.getByRole("heading", { name: "Tempat", exact: true }).isVisible().catch(() => false)) {
    return;
  }
  if (await page.getByRole("heading", { name: "Saya" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /Tempat/ }).first().click();
  }
  await expect(page.getByRole("heading", { name: "Tempat", exact: true })).toBeVisible();
}

test.describe("account", () => {
  test("creates an account and keeps it across a reload", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);

    await page.reload();
    await openSaya(page);
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });

  test("signs out, refuses a wrong password, then signs in", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await openSettings(page);
    await page.getByRole("button", { name: "Keluar dari akun" }).click();
    const signOutDialog = page.getByRole("dialog", { name: "Keluar dari akun" });
    await signOutDialog.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page.getByText("Belum masuk", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Masuk atau buat akun" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Kata sandi", { exact: true }).fill("wrong-horse");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page.getByText("Email or password is wrong.")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("Kata sandi", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });

  test("plans a journey without an account", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Mau ke mana hari ini/ }).click();

    await field(page, "Dari").fill("Bundaran HI");
    await field(page, "Ke").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Cari rute" }).click();

    await expect(page.getByRole("heading", { name: "Pilihan rute" })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("names a place and keeps it across a reload", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await openPlaces(page);

    await page.getByRole("button", { name: "Tambah", exact: true }).click();
    await page.getByLabel("Nama", { exact: true }).fill("Home");

    const place = page.getByRole("combobox", { name: "Tempat", exact: true });
    await place.fill("Bundaran HI");

    const results = page.getByRole("listbox", { name: "Places matching Tempat" });
    const suggestion = results.getByRole("option", { name: /Bundaran HI/ }).first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();

    await page.getByRole("button", { name: "Simpan tempat" }).click();
    // The row exists only after the account has accepted the write, so the
    // reload below cannot race the request. The network owns the stop name,
    // so the assertion reads the row rather than repeating the query.
    const home = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Hapus Home" }) });
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toContainText("Bundaran HI");

    await page.reload();
    await openSaya(page);
    await openPlaces(page);
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toContainText("Bundaran HI");
  });

  test("starts a new place from the find field", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await openPlaces(page);

    const find = page.getByRole("combobox", { name: "Cari tempat bernama", exact: true });
    await find.fill("Bundaran HI");

    const results = page.getByRole("listbox", {
      name: "Places matching Cari tempat bernama",
    });
    const suggestion = results.getByRole("option", { name: /Bundaran HI/ }).first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();

    // The chosen place moves into the form, and the label takes the focus.
    await expect(page.getByLabel("Tempat", { exact: true })).toHaveValue(/Bundaran HI/);
    await expect(page.getByLabel("Nama", { exact: true })).toBeFocused();
  });

  test("saves a place to the account, not to the device", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await page.getByRole("button", { name: "Tutup Saya" }).click();
    await page.getByRole("button", { name: /Mau ke mana hari ini/ }).click();

    await field(page, "Dari").fill("Bundaran HI");
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    // Take the suggestion from the keyboard. On a phone the list is a
    // bottom sheet under the answer sheet, and the answer sheet owns the
    // pointer there.
    await field(page, "Dari").press("Enter");

    const chosen = await field(page, "Dari").inputValue();
    await page.getByRole("button", { name: "Save place" }).click();
    // The star becomes "Remove from saved" only after the account has
    // accepted the write, so the reload below cannot race the request.
    await expect(page.getByRole("button", { name: "Remove from saved" })).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await page.getByRole("button", { name: /Mau ke mana hari ini/ }).click();
    await field(page, "Dari").click();
    await expect(
      page.getByRole("option").filter({ hasText: chosen }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).not.toContain("daily-route.saved-places");
    expect(keys).not.toContain("daily-route.recent-places");
    expect(keys).not.toContain("daily-route.recent-journeys");
    expect(keys).not.toContain("daily-route.watched-trips");
  });
});

test.describe("the rider's current place", () => {
  test.use({
    permissions: ["geolocation"],
    geolocation: { latitude: -6.1952, longitude: 106.8211 },
  });

  test("keeps the reason when the position is outside the network", async ({ page }, testInfo) => {
    await page.route("**/api/places/reverse**", (route) =>
      route.fulfill({
        status: 400,
        json: { error: "That place is outside Jabodetabek, so it is not on this network." },
      }),
    );
    await page.goto("/");

    await createAccount(page, newEmail(testInfo));
    await openPlaces(page);
    await page.getByRole("button", { name: "Tandai lokasi sekarang" }).click();

    await expect(
      page.getByText("That place is outside Jabodetabek, so it is not on this network."),
    ).toBeVisible();
  });

  test("prefills the saved place with the current address", async ({ page }, testInfo) => {
    await page.route("**/api/places/reverse**", (route) =>
      route.fulfill({
        json: {
          place: {
            kind: "place",
            id: "place:current:-6.19520,106.82110",
            name: "Jalan Teluk Betung",
            address: "Jalan Teluk Betung No. 1, Kebon Melati, Jakarta Pusat",
            latitude: -6.1952,
            longitude: 106.8211,
            systemId: null,
            systemName: null,
          },
        },
      }),
    );
    await page.goto("/");

    await createAccount(page, newEmail(testInfo));
    await openPlaces(page);
    await page.getByRole("button", { name: "Tandai lokasi sekarang" }).click();

    // The address and the label are already there; the rider only names it.
    await expect(page.getByLabel("Tempat", { exact: true })).toHaveValue(
      "Jalan Teluk Betung No. 1, Kebon Melati, Jakarta Pusat",
    );
    await expect(page.getByLabel("Nama", { exact: true })).toHaveValue("Lokasi saat ini");

    await page.getByLabel("Nama", { exact: true }).fill("Home");
    await page.getByRole("button", { name: "Simpan tempat" }).click();

    const home = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Hapus Home" }) });
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toContainText("Jalan Teluk Betung No. 1");
  });
});
