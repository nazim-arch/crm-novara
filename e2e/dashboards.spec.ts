import { test, expect } from "@playwright/test";

// ─── CRM Dashboard ────────────────────────────���───────────────────────────────

test.describe("CRM Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/crm");
  });

  test("loads and shows KPI cards", async ({ page }) => {
    await expect(page.getByText("Pipeline Overview (All-time)")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Total Leads")).toBeVisible();
    await expect(page.getByText("Active Leads")).toBeVisible();
    await expect(page.getByText("Hot Leads")).toBeVisible();
  });

  test("shows period KPI section with range label", async ({ page }) => {
    // Default range = This Month — should show label like "Jan 2026" or similar
    await expect(page.getByText(/\w+ \d{4}|Last \d+ days|YTD/)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("New Leads")).toBeVisible();
    await expect(page.getByText("Deals Won")).toBeVisible();
  });

  test("filter bar is visible with preset buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "This Month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 7 Days" })).toBeVisible();
    await expect(page.getByRole("button", { name: "YTD" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Custom/ })).toBeVisible();
  });

  test("YTD filter updates URL and reloads page", async ({ page }) => {
    await page.getByRole("button", { name: "YTD" }).click();
    await expect(page).toHaveURL(/range=ytd/, { timeout: 5_000 });
    await expect(page.getByText(/YTD \d{4}/)).toBeVisible({ timeout: 8_000 });
  });

  test("Last 7 Days filter updates URL", async ({ page }) => {
    await page.getByRole("button", { name: "Last 7 Days" }).click();
    await expect(page).toHaveURL(/range=7d/, { timeout: 5_000 });
    await expect(page.getByText("Last 7 days")).toBeVisible({ timeout: 8_000 });
  });

  test("Custom filter shows date inputs and applies", async ({ page }) => {
    await page.getByRole("button", { name: /Custom/ }).click();
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 3_000 });

    const from = new Date();
    from.setDate(1); // first of this month
    const to = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill(fmt(from));
    await dateInputs.last().fill(fmt(to));
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/range=custom/, { timeout: 5_000 });
  });

  test("shows recent activities section", async ({ page }) => {
    // Activity section should always be visible (even if empty)
    await expect(page.getByText(/Recent Activity|No recent/i)).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Task Dashboard ────────────────────────────────��──────────────────────────

test.describe("Task Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/tasks");
  });

  test("loads and shows heading", async ({ page }) => {
    await expect(page.getByText("Task Dashboard")).toBeVisible({ timeout: 10_000 });
  });

  test("filter bar is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "This Month" })).toBeVisible();
    await expect(page.getByRole("button", { name: "YTD" })).toBeVisible();
  });

  test("range-scoped summary cards show period label", async ({ page }) => {
    // These cards should show the current period label
    await expect(page.getByText(/tasks due in period/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/completion rate|0%/i)).toBeVisible({ timeout: 8_000 });
  });

  test("TaskStatsCards section renders", async ({ page }) => {
    // The TaskStatsCards component renders at least total/overdue/today
    await expect(page.getByText(/Overdue|Due Today|Active/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("Quick Links section has New Task link", async ({ page }) => {
    await expect(page.getByRole("link", { name: "New Task" })).toBeVisible({ timeout: 8_000 });
  });

  test("YTD filter updates data", async ({ page }) => {
    await page.getByRole("button", { name: "YTD" }).click();
    await expect(page).toHaveURL(/range=ytd/, { timeout: 5_000 });
    await expect(page.getByText(/YTD \d{4}/)).toBeVisible({ timeout: 8_000 });
  });
});
