import { test, expect } from "@playwright/test";

// ─── Commission Overview ──────────────────────────────────────────────────────

test.describe("Commission Overview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sales-commission");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(
      page.getByText(/Commission Overview|My Commission/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("filter bar is visible with preset buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "This Month" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: "Last Month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "YTD" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Custom/ })).toBeVisible();
  });

  test("This Month filter is active by default", async ({ page }) => {
    // Default range = current_month — button should have violet background
    const thisMonthBtn = page.getByRole("button", { name: "This Month" });
    await expect(thisMonthBtn).toHaveClass(/bg-violet-600/, { timeout: 8_000 });
  });

  test("YTD filter updates URL and shows multi-month view", async ({ page }) => {
    await page.getByRole("button", { name: "YTD" }).click();
    await expect(page).toHaveURL(/range=ytd/, { timeout: 5_000 });
    await expect(page.getByText(/YTD \d{4}/)).toBeVisible({ timeout: 8_000 });
  });

  test("Last Month filter changes range label", async ({ page }) => {
    await page.getByRole("button", { name: "Last Month" }).click();
    await expect(page).toHaveURL(/range=last_month/, { timeout: 5_000 });
    // Label should now say a month name + year
    await expect(page.getByText(/[A-Z][a-z]+ \d{4}/)).toBeVisible({ timeout: 8_000 });
  });

  test("Custom filter shows date pickers", async ({ page }) => {
    await page.getByRole("button", { name: /Custom/ }).click();
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 3_000 });
  });

  test("commission table shows header columns", async ({ page }) => {
    await expect(page.getByText("Sales Rep")).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText("Closed Revenue").or(page.getByText("Revenue"))
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.getByText("Commission").or(page.getByText("commission", { exact: false }))
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Commission Setup (Targets page) ─────────────────────────────────────────

test.describe("Commission Targets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sales-commission/targets");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByText(/Commission Setup/i)).toBeVisible({ timeout: 10_000 });
  });

  test("shows Monthly Targets section", async ({ page }) => {
    await expect(page.getByText("Monthly Targets")).toBeVisible({ timeout: 8_000 });
  });

  test("shows Commission Slabs section", async ({ page }) => {
    await expect(page.getByText("Commission Slabs")).toBeVisible({ timeout: 8_000 });
  });

  test("target year and month selectors are present", async ({ page }) => {
    const now = new Date();
    // Year input should show current year
    const yearInput = page.locator('input[type="number"]');
    await expect(yearInput.first()).toBeVisible({ timeout: 8_000 });
    const val = await yearInput.first().inputValue();
    expect(Number(val)).toBeGreaterThanOrEqual(now.getFullYear());
  });

  test("Save target button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Save target/i })).toBeVisible({ timeout: 8_000 });
  });

  test("slab editor has Add slab button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Add slab/i })).toBeVisible({ timeout: 8_000 });
  });

  test("Save structure button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Save structure/i })).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Commission Report ────────────────────────────────────────────────────────

test.describe("Commission Report", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sales-commission/report");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByText(/Commission Report/i)).toBeVisible({ timeout: 10_000 });
  });

  test("month and year selectors are visible", async ({ page }) => {
    const now = new Date();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    // One of these month names should be in a select
    await expect(page.locator("select").first()).toBeVisible({ timeout: 8_000 });
  });

  test("Export CSV button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible({ timeout: 8_000 });
  });

  test("table headers are visible", async ({ page }) => {
    await expect(page.getByText("Name")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Closed Revenue")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Achievement")).toBeVisible({ timeout: 8_000 });
  });
});
