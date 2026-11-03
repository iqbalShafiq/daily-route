import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * The account sheet and the rider memory it owns.
 *
 * The same tests drive a phone and a desktop, so the sheet has to be
 * reachable from the floating cluster as well as from the top-right stack.
 * The planner is checked without an account first: signing in is an
 * addition, not a gate.
 */

const PASSWORD = "correct-horse";

function field(page: Page, name: "From" | "To") {
  return page.getByRole("combobox", { name, exact: true });
}

function newEmail(testInfo: TestInfo): string {
  return `e2e.${testInfo.project.name}.${Date.now()}@example.test`;
}

async function openAccount(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
}

async function createAccount(page: Page, email: string): Promise<void> {
  await openAccount(page);
  await page.getByRole("tab", { name: "Create account" }).click();
  const panel = page.getByRole("tabpanel", { name: "Create account" });
  await panel.getByLabel("Email").fill(email);
  await panel.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await panel.getByLabel("Confirm password").fill(PASSWORD);
  await panel.getByRole("button", { name: "Create account" }).click();
  // The address runs as a marquee when it does not fit, and the second
  // copy is the one it runs into, so point at the first copy only.
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("account", () => {
  test("creates an account and keeps it across a reload", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);

    await page.reload();
    await openAccount(page);
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });

  test("signs out, refuses a wrong password, then signs in", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Delete account" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete account" });
    await expect(deleteDialog.getByLabel("Password")).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Keep account" }).click();
    await expect(deleteDialog).toBeHidden();

    await page.getByRole("button", { name: "Sign out" }).click();
    const signOutDialog = page.getByRole("dialog", { name: "Sign out" });
    await signOutDialog.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();

    const panel = page.getByRole("tabpanel", { name: "Sign in" });
    await panel.getByLabel("Email").fill(email);
    await panel.getByLabel("Password", { exact: true }).fill("wrong-horse");
    await panel.getByRole("button", { name: "Sign in" }).click();
    await expect(panel.getByText("Email or password is wrong.")).toBeVisible({
      timeout: 15_000,
    });

    await panel.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await panel.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(email).first()).toBeVisible({ timeout: 15_000 });
  });

  test("plans a journey without an account", async ({ page }) => {
    await page.goto("/");

    await field(page, "From").fill("Bundaran HI");
    await field(page, "To").fill("Kelapa Gading");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Show route" }).click();

    await expect(page.getByText("Fare")).toBeVisible({ timeout: 30_000 });
  });

  test("names a place and keeps it across a reload", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await page.getByRole("button", { name: "Add a place" }).click();

    await page.getByLabel("Name", { exact: true }).fill("Home");
    await page.getByLabel("Place", { exact: true }).fill("Bundaran HI");

    // The account sheet offers its own suggestions. The empty board also
    // carries a "Bundaran HI → Kota" example on a wide screen, so the
    // search is scoped to the sheet's list rather than the whole page.
    const results = page.getByRole("listbox", { name: "Places matching Place" });
    const suggestion = results.getByRole("option", { name: /Bundaran HI/ }).first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();

    await page.getByRole("button", { name: "Add place" }).click();
    // The row exists only after the account has accepted the write, so the
    // reload below cannot race the request. The network owns the stop name,
    // so the assertion reads the row rather than repeating the query.
    const home = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Remove Home" }) });
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toContainText("Bundaran HI");

    await page.reload();
    await openAccount(page);
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toContainText("Bundaran HI");
  });

  test("starts a new place from the find field", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);

    const find = page.getByRole("combobox", { name: "Find a place", exact: true });
    await find.fill("Bundaran HI");

    const results = page.getByRole("listbox", { name: "Places matching Find a place" });
    const suggestion = results.getByRole("option", { name: /Bundaran HI/ }).first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();

    // The chosen place moves into the form, and the find field folds
    // away instead of leaving two search fields on the screen.
    await expect(page.getByLabel("Place", { exact: true })).toHaveValue(/Bundaran HI/);
    await expect(page.locator("[data-place-find]")).toHaveAttribute("data-state", "closed");
    await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  });

  test("saves a place to the account, not to the device", async ({ page }, testInfo) => {
    const email = newEmail(testInfo);
    await page.goto("/");

    await createAccount(page, email);
    await page.getByRole("button", { name: "Close account" }).click();
    await expect(page.getByRole("heading", { name: "Account" })).toHaveCount(0);

    await field(page, "From").fill("Bundaran HI");
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    // Take the suggestion from the keyboard. On a phone the list is a
    // bottom sheet under the answer sheet, and the answer sheet owns the
    // pointer there.
    await field(page, "From").press("Enter");

    const chosen = await field(page, "From").inputValue();
    await page.getByRole("button", { name: "Save place" }).click();
    // The star becomes "Remove from saved" only after the account has
    // accepted the write, so the reload below cannot race the request.
    await expect(page.getByRole("button", { name: "Remove from saved" })).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await field(page, "From").click();
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
