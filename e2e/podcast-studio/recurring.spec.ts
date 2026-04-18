import { test, expect } from "@playwright/test";
import { futureDate, selectOption, cleanupTestBookings } from "./helpers";

const CLIENT = "E2E-TEST Recurring";

// All recurring tests use dates far enough out to avoid collisions
const START_DATE = futureDate(90);
const UNTIL_DATE = futureDate(118); // ~4 weeks ahead of start

test.beforeEach(async ({ page }) => {
  await page.goto("/podcast-studio/bookings/new");
});

test.afterAll(async ({ request }) => {
  await cleanupTestBookings(request, "E2E-TEST");
});

// ─── Panel visibility ─────────────────────────────────────────────────────────

test.describe("Recurring panel", () => {
  test("does not show recurring panel for One-time bookings", async ({ page }) => {
    await expect(page.getByText("Recurring Schedule")).not.toBeVisible();
  });

  test("shows recurring panel when Recurring is selected", async ({ page }) => {
    await selectOption(page, "Booking Type", "Recurring");
    await expect(page.getByText("Recurring Schedule")).toBeVisible();
  });

  test("hides panel again when switched back to One-time", async ({ page }) => {
    await selectOption(page, "Booking Type", "Recurring");
    await expect(page.getByText("Recurring Schedule")).toBeVisible();
    await selectOption(page, "Booking Type", "One-time");
    await expect(page.getByText("Recurring Schedule")).not.toBeVisible();
  });

  test("auto-selects the booking date's day of week in recurring panel", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");

    // The day chip for the booking date's weekday should be active (violet background)
    const dayIndex = new Date(START_DATE + "T00:00:00").getDay();
    const dayChips = page.locator("button.rounded-full");
    await expect(dayChips.nth(dayIndex)).toHaveClass(/bg-violet-600/, { timeout: 3_000 });
  });

  test("defaults until date to ~4 weeks from booking date", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");

    const untilInput = page.locator('input[type="date"]').nth(1);
    const value = await untilInput.inputValue();
    expect(value).toBeTruthy();

    const startMs = new Date(START_DATE).getTime();
    const untilMs = new Date(value).getTime();
    const diffDays = (untilMs - startMs) / 86_400_000;
    expect(diffDays).toBeGreaterThanOrEqual(27);
    expect(diffDays).toBeLessThanOrEqual(29);
  });
});

// ─── Weekly recurring ─────────────────────────────────────────────────────────

test.describe("Weekly recurring", () => {
  test("shows correct slot count for weekly selection", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");

    // Select one specific weekday (Monday = index 1)
    const dayChips = page.locator("button.rounded-full");
    // Deselect all then select Monday
    for (let i = 0; i < 7; i++) {
      const cls = await dayChips.nth(i).getAttribute("class") ?? "";
      if (cls.includes("bg-violet-600")) await dayChips.nth(i).click();
    }
    await dayChips.nth(1).click(); // Monday

    await page.locator('input[type="date"]').nth(1).fill(UNTIL_DATE);

    // Preview should show "X bookings will be created"
    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible({ timeout: 3_000 });
    const text = await page.getByText(/\d+ booking.* will be created/).textContent();
    const count = parseInt(text ?? "0");
    expect(count).toBeGreaterThanOrEqual(3); // at least 3 Mondays in ~4 weeks
    expect(count).toBeLessThanOrEqual(5);
  });

  test("bi-weekly shows roughly half the slots of weekly", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");

    const dayChips = page.locator("button.rounded-full");
    for (let i = 0; i < 7; i++) {
      const cls = await dayChips.nth(i).getAttribute("class") ?? "";
      if (cls.includes("bg-violet-600")) await dayChips.nth(i).click();
    }
    await dayChips.nth(1).click(); // Monday

    await page.locator('input[type="date"]').nth(1).fill(UNTIL_DATE);

    const weeklyText = await page.getByText(/\d+ booking.* will be created/).textContent();
    const weeklyCount = parseInt(weeklyText ?? "0");

    await selectOption(page, "Frequency", "Every 2 weeks");

    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible();
    const biText = await page.getByText(/\d+ booking.* will be created/).textContent();
    const biCount = parseInt(biText ?? "0");

    expect(biCount).toBeLessThan(weeklyCount);
  });

  test("selecting multiple days increases slot count", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");
    await page.locator('input[type="date"]').nth(1).fill(UNTIL_DATE);

    const dayChips = page.locator("button.rounded-full");
    // Deselect all
    for (let i = 0; i < 7; i++) {
      const cls = await dayChips.nth(i).getAttribute("class") ?? "";
      if (cls.includes("bg-violet-600")) await dayChips.nth(i).click();
    }

    // Select Monday only
    await dayChips.nth(1).click();
    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible();
    const oneDayText = await page.getByText(/\d+ booking.* will be created/).textContent();
    const oneDayCount = parseInt(oneDayText ?? "0");

    // Also select Wednesday
    await dayChips.nth(3).click();
    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible();
    const twoDayText = await page.getByText(/\d+ booking.* will be created/).textContent();
    const twoDayCount = parseInt(twoDayText ?? "0");

    expect(twoDayCount).toBeGreaterThan(oneDayCount);
  });

  test("conflict chips turn red for taken dates", async ({ page }) => {
    // Use a date with an existing booking created by booking-form.spec.ts
    const conflictDate = futureDate(60);
    await page.fill("#booking_date", conflictDate);
    await selectOption(page, "Start Time", "10:00 AM");
    await selectOption(page, "Duration", "1 hr");
    await selectOption(page, "Booking Type", "Recurring");
    await page.locator('input[type="date"]').nth(1).fill(futureDate(64));

    // Conflict check is debounced — wait up to 3s for red chip to appear
    await expect(page.locator(".line-through").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/conflict.*will be skipped/i)).toBeVisible();
  });

  test("submits weekly recurring and redirects to bookings list", async ({ page }) => {
    const submitDate = futureDate(150);
    const submitUntil = futureDate(178);

    await page.fill("#booking_date", submitDate);
    await selectOption(page, "Start Time", "3:00 PM");
    await selectOption(page, "Duration", "1 hr");
    await selectOption(page, "Booking Type", "Recurring");
    await page.fill("#client_name", CLIENT);

    await page.locator('input[type="date"]').nth(1).fill(submitUntil);

    // Ensure at least one day is selected
    const dayChips = page.locator("button.rounded-full");
    const hasSelected = (await dayChips.nth(1).getAttribute("class") ?? "").includes("bg-violet-600");
    if (!hasSelected) await dayChips.nth(1).click();

    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible();

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/podcast-studio\/bookings/, { timeout: 15_000 });

    // URL should contain created count
    expect(page.url()).toMatch(/created=\d+/);
  });
});

// ─── Monthly recurring ────────────────────────────────────────────────────────

test.describe("Monthly recurring", () => {
  test("hides days-of-week selector when monthly is selected", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Every month");

    await expect(page.getByText("Days of week")).not.toBeVisible();
  });

  test("shows correct monthly slot count", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Every month");

    const untilSixMonths = futureDate(90 + 180); // 6 months ahead
    await page.locator('input[type="date"]').nth(1).fill(untilSixMonths);

    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible({ timeout: 3_000 });
    const text = await page.getByText(/\d+ booking.* will be created/).textContent();
    const count = parseInt(text ?? "0");
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(7);
  });

  test("submits monthly recurring bookings", async ({ page }) => {
    const monthlyStart = futureDate(200);
    const monthlyUntil = futureDate(380); // ~6 months

    await page.fill("#booking_date", monthlyStart);
    await selectOption(page, "Start Time", "4:00 PM");
    await selectOption(page, "Duration", "1 hr");
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Every month");
    await page.fill("#client_name", `${CLIENT} Monthly`);

    await page.locator('input[type="date"]').nth(1).fill(monthlyUntil);
    await expect(page.getByText(/\d+ booking.* will be created/)).toBeVisible();

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/podcast-studio\/bookings/, { timeout: 15_000 });
    expect(page.url()).toMatch(/created=\d+/);
  });
});

// ─── Custom recurring ─────────────────────────────────────────────────────────

test.describe("Custom recurring", () => {
  test("shows slot picker when Custom dates is selected", async ({ page }) => {
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");

    await expect(page.getByText("Add slots (each with its own date and time)")).toBeVisible();
    await expect(page.getByText("Days of week")).not.toBeVisible();
    await expect(page.getByText("Repeat until")).not.toBeVisible();
  });

  test("can add a custom slot with specific time", async ({ page }) => {
    const slotDate = futureDate(120);

    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");

    // Fill the custom slot input row
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.last().fill(slotDate);

    // Select start time in the inline time select (second combobox in custom panel)
    const comboboxes = page.getByRole("combobox");
    await comboboxes.filter({ hasText: /Time/ }).click();
    await page.getByRole("option", { name: "11:00 AM" }).click();

    await page.locator("button", { hasText: "Add" }).last().click();

    // Slot row should appear
    await expect(page.getByText("11:00 AM")).toBeVisible();
  });

  test("can add multiple slots with different times on different dates", async ({ page }) => {
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");

    const slots = [
      { date: futureDate(121), time: "10:00 AM" },
      { date: futureDate(122), time: "2:00 PM" },
      { date: futureDate(123), time: "4:30 PM" },
    ];

    for (const slot of slots) {
      await page.locator('input[type="date"]').last().fill(slot.date);
      await page.getByRole("combobox").filter({ hasText: /Time/ }).click();
      await page.getByRole("option", { name: slot.time }).click();
      await page.locator("button", { hasText: "Add" }).last().click();
      await expect(page.getByText(slot.time)).toBeVisible();
    }

    // Summary should say "3 bookings will be created"
    await expect(page.getByText(/3 booking.* will be created/)).toBeVisible({ timeout: 3_000 });
  });

  test("cannot add a duplicate date+time combination", async ({ page }) => {
    const dupDate = futureDate(125);

    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");

    await page.locator('input[type="date"]').last().fill(dupDate);
    await page.getByRole("combobox").filter({ hasText: /Time/ }).click();
    await page.getByRole("option", { name: "11:00 AM" }).click();
    await page.locator("button", { hasText: "Add" }).last().click();

    // Try to add same slot again — Add button should be disabled
    await page.locator('input[type="date"]').last().fill(dupDate);
    await page.getByRole("combobox").filter({ hasText: /Time/ }).click();
    await page.getByRole("option", { name: "11:00 AM" }).click();

    await expect(page.locator("button", { hasText: "Add" }).last()).toBeDisabled();
  });

  test("can remove a custom slot", async ({ page }) => {
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");

    await page.locator('input[type="date"]').last().fill(futureDate(130));
    await page.getByRole("combobox").filter({ hasText: /Time/ }).click();
    await page.getByRole("option", { name: "10:00 AM" }).click();
    await page.locator("button", { hasText: "Add" }).last().click();

    await expect(page.getByText(/1 booking.* will be created/)).toBeVisible();

    // Click the × remove button
    await page.locator("button", { hasText: "×" }).last().click();

    await expect(page.getByText(/1 booking.* will be created/)).not.toBeVisible();
  });

  test("submits custom recurring with per-slot times and redirects", async ({ page }) => {
    await page.fill("#booking_date", futureDate(160));
    await selectOption(page, "Start Time", "10:00 AM");
    await selectOption(page, "Duration", "1 hr");
    await selectOption(page, "Booking Type", "Recurring");
    await selectOption(page, "Frequency", "Custom dates");
    await page.fill("#client_name", `${CLIENT} Custom`);

    // Add 2 non-conflicting slots
    const customSlots = [
      { date: futureDate(160), time: "10:00 AM" },
      { date: futureDate(161), time: "2:00 PM" },
    ];

    for (const slot of customSlots) {
      await page.locator('input[type="date"]').last().fill(slot.date);
      await page.getByRole("combobox").filter({ hasText: /Time/ }).click();
      await page.getByRole("option", { name: slot.time }).click();
      await page.locator("button", { hasText: "Add" }).last().click();
    }

    await expect(page.getByText(/2 booking.* will be created/)).toBeVisible();

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/podcast-studio\/bookings/, { timeout: 15_000 });
    expect(page.url()).toMatch(/created=2/);
  });
});

// ─── Summary sidebar ─────────────────────────────────────────────────────────

test.describe("Booking summary sidebar", () => {
  test("shows recurring slot count badge in summary", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Booking Type", "Recurring");
    await page.locator('input[type="date"]').nth(1).fill(UNTIL_DATE);

    // The summary sidebar should show "N recurring slots"
    await expect(page.getByText(/\d+ recurring slots/)).toBeVisible({ timeout: 3_000 });
  });

  test("summary shows correct end time", async ({ page }) => {
    await page.fill("#booking_date", START_DATE);
    await selectOption(page, "Start Time", "10:00 AM");
    await selectOption(page, "Duration", "2 hrs");

    await expect(page.getByText("12:00 PM")).toBeVisible();
  });
});
