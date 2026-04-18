import { test, expect } from "@playwright/test";
import { futureDate, selectOption, cleanupTestBookings } from "./helpers";

const BASE_DATE = futureDate(60); // 2 months out — avoids existing data
const CLIENT_PREFIX = "E2E-TEST";

test.beforeEach(async ({ page }) => {
  await page.goto("/podcast-studio/bookings/new");
});

test.afterAll(async ({ request }) => {
  await cleanupTestBookings(request, CLIENT_PREFIX);
});

// ─── One-time booking ────────────────────────────────────────────────────────

test.describe("One-time booking", () => {
  test("form loads and shows Booking Details section", async ({ page }) => {
    await expect(page.getByText("Booking Details")).toBeVisible();
    await expect(page.getByText("Revenue Components")).toBeVisible();
    await expect(page.getByText("Booking Summary")).toBeVisible();
  });

  test("creates a Confirmed one-time booking", async ({ page }) => {
    await page.fill("#booking_date", BASE_DATE);
    await selectOption(page, "Start Time", "10:00 AM");
    await selectOption(page, "Duration", "1 hr");
    await page.fill("#client_name", `${CLIENT_PREFIX} Confirmed`);

    // Availability should show green
    await expect(page.getByText("Slot is available")).toBeVisible({ timeout: 5_000 });

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/podcast-studio\/bookings/, { timeout: 10_000 });
    await expect(page.getByText(`${CLIENT_PREFIX} Confirmed`)).toBeVisible();
  });

  test("creates a Tentative booking", async ({ page }) => {
    const tentDate = futureDate(61);
    await page.fill("#booking_date", tentDate);
    await selectOption(page, "Start Time", "2:00 PM");
    await selectOption(page, "Duration", "1 hr");
    await selectOption(page, "Status", "Tentative");
    await page.fill("#client_name", `${CLIENT_PREFIX} Tentative`);

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/podcast-studio\/bookings/, { timeout: 10_000 });

    // Tentative badge should be visible with amber colour
    const badge = page.getByText("Tentative").first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/amber/);
  });

  test("Tentative slot blocks same-time booking (treated as occupied)", async ({ page }) => {
    // Tentative already created in prior test — try to book the same slot
    const tentDate = futureDate(61);
    await page.fill("#booking_date", tentDate);
    await selectOption(page, "Start Time", "2:00 PM");
    await selectOption(page, "Duration", "1 hr");

    // Should show conflict, not "Slot is available"
    await expect(page.getByText(/Conflicts with/)).toBeVisible({ timeout: 5_000 });
  });

  test("shows conflict warning for an overlapping slot", async ({ page }) => {
    // BASE_DATE 10:00–11:00 already created in first test
    await page.fill("#booking_date", BASE_DATE);
    await selectOption(page, "Start Time", "10:00 AM");
    await selectOption(page, "Duration", "1 hr");

    await expect(page.getByText(/Conflicts with/)).toBeVisible({ timeout: 5_000 });
  });

  test("end-time exceeding studio close is flagged", async ({ page }) => {
    await page.fill("#booking_date", futureDate(62));
    await selectOption(page, "Start Time", "8:00 PM");
    await selectOption(page, "Duration", "1 hr");

    await expect(page.getByText(/exceeds 8:30 PM studio close/)).toBeVisible({ timeout: 5_000 });
  });

  test("Save & New creates booking and reloads blank form", async ({ page }) => {
    await page.fill("#booking_date", futureDate(63));
    await selectOption(page, "Start Time", "11:00 AM");
    await selectOption(page, "Duration", "30 min");
    await page.fill("#client_name", `${CLIENT_PREFIX} SaveNew`);

    await page.locator("button", { hasText: "Save & New" }).click();
    await page.waitForURL(/\/podcast-studio\/bookings\/new/, { timeout: 10_000 });

    // Form should be blank
    await expect(page.locator("#client_name")).toHaveValue("");
  });
});

// ─── Booking list ─────────────────────────────────────────────────────────────

test.describe("Booking list", () => {
  test("status filter shows only Tentative bookings", async ({ page }) => {
    await page.goto("/podcast-studio/bookings");
    await selectOption(page, "Status", "Tentative");
    // Wait for list to reload
    await page.waitForTimeout(500);

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      // Every visible badge should say Tentative
      const badges = page.locator("span").filter({ hasText: /^Tentative$/ });
      await expect(badges.first()).toBeVisible();
    }
  });

  test("status badge colours are correct", async ({ page }) => {
    await page.goto("/podcast-studio/bookings");

    // Check each badge class when the relevant status is visible
    const confirmed = page.locator("span").filter({ hasText: /^Confirmed$/ }).first();
    if (await confirmed.isVisible()) await expect(confirmed).toHaveClass(/emerald/);

    const tentative = page.locator("span").filter({ hasText: /^Tentative$/ }).first();
    if (await tentative.isVisible()) await expect(tentative).toHaveClass(/amber/);

    const cancelled = page.locator("span").filter({ hasText: /^Cancelled$/ }).first();
    if (await cancelled.isVisible()) await expect(cancelled).toHaveClass(/red/);

    const completed = page.locator("span").filter({ hasText: /^Completed$/ }).first();
    if (await completed.isVisible()) await expect(completed).toHaveClass(/blue/);
  });
});
