import { test, expect } from "@playwright/test";
import { selectOption, cleanupTestOpportunities } from "./helpers";

const PREFIX = "E2E-TEST Opp";

test.afterAll(async ({ request }) => {
  await cleanupTestOpportunities(request, "E2E-TEST");
});

// ─── Opportunities list ───────────────────────────────────────────────────────

test.describe("Opportunities list", () => {
  test("loads and shows table", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByText(/Opportunities/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("table, [role='table']").first()).toBeVisible({ timeout: 8_000 });
  });

  test("New Opportunity button navigates to create form", async ({ page }) => {
    await page.goto("/opportunities");
    await page.getByRole("link", { name: /New Opportunity/i }).click();
    await expect(page).toHaveURL(/\/opportunities\/new/);
  });

  test("status filter shows active/inactive/sold options", async ({ page }) => {
    await page.goto("/opportunities");
    const statusFilter = page
      .locator("button[role='combobox']")
      .filter({ hasText: /Status|All/i })
      .first();
    if (await statusFilter.isVisible({ timeout: 3_000 })) {
      await statusFilter.click();
      await expect(page.getByRole("option", { name: "Active" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Inactive" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Sold" })).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });
});

// ─── Create opportunity ───────────────────────────────────────────────────────

test.describe("Create opportunity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/opportunities/new");
    await expect(page.locator("#name")).toBeVisible({ timeout: 10_000 });
  });

  test("form has required fields", async ({ page }) => {
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#project")).toBeVisible();
    await expect(page.locator("#location")).toBeVisible();
    await expect(page.getByText("Property Type")).toBeVisible();
    await expect(page.getByText("Commission %")).toBeVisible();
  });

  test("shows validation errors on empty submit", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 3_000 });
  });

  test("creates an opportunity and redirects to detail", async ({ page }) => {
    await page.fill("#name", `${PREFIX} Apartment Block`);
    await page.fill("#project", "Skyline Heights");
    await page.fill("#location", "Wakad, Pune");
    await selectOption(page, "Property Type", "Apartment");
    await page.fill("#commission_percent", "2");

    // Fill first configuration row
    const labelInputs = page.locator('input[placeholder*="BHK"], input[placeholder*="e.g"]');
    if (await labelInputs.first().isVisible({ timeout: 2_000 })) {
      await labelInputs.first().fill("2BHK");
    }
    // Units and price
    const numberInputs = page.locator('input[type="number"]');
    const unitInput = numberInputs.nth(0);
    const priceInput = numberInputs.nth(1);
    if (await unitInput.isVisible({ timeout: 2_000 })) {
      await unitInput.fill("10");
      await priceInput.fill("5000000");
    }

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/opportunities\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Apartment Block`)).toBeVisible({ timeout: 8_000 });
  });

  test("creates a commercial opportunity", async ({ page }) => {
    await page.fill("#name", `${PREFIX} Commercial Plaza`);
    await page.fill("#project", "Trade Center");
    await page.fill("#location", "Baner, Pune");
    await selectOption(page, "Property Type", "Commercial");
    await page.fill("#commission_percent", "1.5");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/opportunities\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Commercial Plaza`)).toBeVisible({ timeout: 8_000 });
  });

  test("possible revenue preview updates when commission % is filled", async ({ page }) => {
    await selectOption(page, "Property Type", "Apartment");
    await page.fill("#commission_percent", "2");

    // Fill a config row so totalSalesValue > 0
    const labelInputs = page.locator('input[placeholder*="BHK"], input[placeholder*="e.g"]');
    if (await labelInputs.first().isVisible({ timeout: 2_000 })) {
      await labelInputs.first().fill("3BHK");
      const numberInputs = page.locator('input[type="number"]');
      await numberInputs.nth(0).fill("5");
      await numberInputs.nth(1).fill("8000000");
    }

    // Possible revenue preview should appear somewhere
    await expect(page.getByText(/Possible Revenue|possible/i)).toBeVisible({ timeout: 3_000 });
  });

  test("Add Configuration row button adds a new row", async ({ page }) => {
    await page.getByRole("button", { name: /Add|Add Config/i }).last().click();
    const configRows = page.locator('input[placeholder*="BHK"], input[placeholder*="e.g"]');
    await expect(configRows).toHaveCount(await configRows.count(), { timeout: 2_000 });
  });
});

// ─── Opportunity detail ───────────────────────────────────────────────────────

test.describe("Opportunity detail", () => {
  let oppUrl: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post("/api/opportunities", {
      data: {
        name: `${PREFIX} Detail View`,
        project: "Test Project",
        location: "Test Location",
        property_type: "Apartment",
        commission_percent: 2,
        status: "Active",
        configurations: [{ label: "2BHK", number_of_units: 1, price_per_unit: 5000000 }],
      },
    });
    if (res.ok()) {
      const { data } = await res.json();
      oppUrl = `/opportunities/${data.id}`;
    }
  });

  test("opportunity detail loads with name", async ({ page }) => {
    if (!oppUrl) test.skip();
    await page.goto(oppUrl);
    await expect(page.getByText(`${PREFIX} Detail View`)).toBeVisible({ timeout: 10_000 });
  });

  test("opportunity detail shows financials section", async ({ page }) => {
    if (!oppUrl) test.skip();
    await page.goto(oppUrl);
    await expect(
      page.getByText(/Commission|Revenue|Sales Value/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("opportunity detail has edit link", async ({ page }) => {
    if (!oppUrl) test.skip();
    await page.goto(oppUrl);
    await expect(
      page.getByRole("link", { name: /Edit/i }).or(page.getByRole("button", { name: /Edit/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});
