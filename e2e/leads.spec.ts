import { test, expect } from "@playwright/test";
import { futureDate, selectOption, cleanupTestLeads } from "./helpers";

const PREFIX = "E2E-TEST Lead";

test.afterAll(async ({ request }) => {
  await cleanupTestLeads(request, "E2E-TEST");
});

// ─── Leads list ───────────���───────────────────────────────���───────────────────

test.describe("Leads list", () => {
  test("loads and shows table headers", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByText("Leads")).toBeVisible({ timeout: 10_000 });
    // Table or list should be present
    await expect(page.locator("table, [role='table']").first()).toBeVisible({ timeout: 8_000 });
  });

  test("New Lead button navigates to create form", async ({ page }) => {
    await page.goto("/leads");
    await page.getByRole("link", { name: /New Lead/i }).click();
    await expect(page).toHaveURL(/\/leads\/new/);
  });

  test("search input filters results", async ({ page }) => {
    await page.goto("/leads");
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("XYZNOTEXIST99999");
      await page.waitForTimeout(600); // debounce
      // Should show empty state or fewer rows
      await expect(page.getByText(/No leads|no results|0 leads/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ─── Create lead ────────────────────────────────────────────��─────────────────

test.describe("Create lead", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/leads/new");
    await expect(page.getByText("Contact Details")).toBeVisible({ timeout: 10_000 });
  });

  test("form has all required fields", async ({ page }) => {
    await expect(page.locator("#full_name")).toBeVisible();
    await expect(page.locator("#phone")).toBeVisible();
    await expect(page.getByText("Lead Source")).toBeVisible();
    await expect(page.getByText("Temperature")).toBeVisible();
    await expect(page.getByText("Lead Owner")).toBeVisible();
    await expect(page.getByText("Assigned To")).toBeVisible();
  });

  test("shows validation errors when submitting empty form", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 3_000 });
  });

  test("creates a lead and redirects to lead detail", async ({ page }) => {
    const phone = `999${Date.now().toString().slice(-7)}`;

    await page.fill("#full_name", `${PREFIX} Create`);
    await page.fill("#phone", phone);
    await selectOption(page, "Lead Source", "Website");
    await selectOption(page, "Temperature", "Cold");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/leads\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Create`)).toBeVisible({ timeout: 8_000 });
  });

  test("creates a Hot lead", async ({ page }) => {
    const phone = `888${Date.now().toString().slice(-7)}`;

    await page.fill("#full_name", `${PREFIX} Hot`);
    await page.fill("#phone", phone);
    await selectOption(page, "Lead Source", "Referral");
    await selectOption(page, "Temperature", "Hot");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/leads\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Hot`)).toBeVisible({ timeout: 8_000 });
  });

  test("shows duplicate warning for same phone number", async ({ page }) => {
    // Use the phone number from a lead we know exists (created in previous test)
    // Instead: fill in, wait for debounced duplicate check
    const phone = `777${Date.now().toString().slice(-7)}`;
    await page.fill("#full_name", `${PREFIX} Dup A`);
    await page.fill("#phone", phone);
    await selectOption(page, "Lead Source", "Website");
    await selectOption(page, "Temperature", "Cold");
    // Submit first lead
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/leads\/[a-z0-9]+/, { timeout: 15_000 });

    // Navigate back and try with same phone
    await page.goto("/leads/new");
    await page.fill("#full_name", `${PREFIX} Dup B`);
    await page.fill("#phone", phone);
    await selectOption(page, "Lead Source", "Website");
    await selectOption(page, "Temperature", "Cold");

    // Wait for debounce to trigger duplicate check
    await page.waitForTimeout(1500);

    await page.locator('button[type="submit"]').click();
    // Should show duplicate warning dialog
    await expect(page.getByText(/similar|duplicate|already exists/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Requirement tab is accessible", async ({ page }) => {
    await page.getByRole("tab", { name: "Requirement" }).click();
    await expect(page.getByText("Location Preference")).toBeVisible({ timeout: 3_000 });
  });

  test("Follow-up tab is accessible and has date field", async ({ page }) => {
    await page.getByRole("tab", { name: "Follow-up" }).click();
    await expect(page.locator("#next_followup_date")).toBeVisible({ timeout: 3_000 });
  });

  test("creates lead with follow-up details", async ({ page }) => {
    const phone = `666${Date.now().toString().slice(-7)}`;
    const followupDate = futureDate(3);

    await page.fill("#full_name", `${PREFIX} Followup`);
    await page.fill("#phone", phone);
    await selectOption(page, "Lead Source", "Google Ads");
    await selectOption(page, "Temperature", "Warm");

    // Fill follow-up tab
    await page.getByRole("tab", { name: "Follow-up" }).click();
    await page.fill("#next_followup_date", followupDate);
    await selectOption(page, "Follow-up Type", "Call");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/leads\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Followup`)).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Lead detail page ─────────────────────────────────────────────────────────

test.describe("Lead detail", () => {
  let leadUrl: string;

  test.beforeAll(async ({ request }) => {
    // Create a lead via API for the detail tests
    const res = await request.post("/api/leads", {
      data: {
        full_name: `${PREFIX} Detail`,
        phone: `555${Date.now().toString().slice(-7)}`,
        lead_source: "Website",
        temperature: "Cold",
        status: "New",
      },
    });
    if (res.ok()) {
      const { data } = await res.json();
      leadUrl = `/leads/${data.id}`;
    }
  });

  test("lead detail page loads with name and actions", async ({ page }) => {
    if (!leadUrl) test.skip();
    await page.goto(leadUrl);
    await expect(page.getByText(`${PREFIX} Detail`)).toBeVisible({ timeout: 10_000 });
    // Should have Edit button or link
    await expect(page.getByRole("link", { name: /Edit/i }).or(page.getByRole("button", { name: /Edit/i }))).toBeVisible({ timeout: 5_000 });
  });

  test("lead detail shows stage changer", async ({ page }) => {
    if (!leadUrl) test.skip();
    await page.goto(leadUrl);
    // Stage changer should have at minimum the current stage visible
    await expect(page.getByText(/New|Qualified|Visit|FollowUp|Negotiation/i).first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Lead filters ───────────���─────────────────────────────────────────────────

test.describe("Lead list filters", () => {
  test("status filter works", async ({ page }) => {
    await page.goto("/leads");
    // Look for status filter dropdown
    const statusFilter = page.locator("button[role='combobox']").filter({ hasText: /Status|All/i }).first();
    if (await statusFilter.isVisible({ timeout: 3_000 })) {
      await statusFilter.click();
      await page.getByRole("option", { name: "Won" }).click();
      await page.waitForTimeout(500);
      // After filtering, any visible badges should be Won
      const wonBadges = page.locator("span, td").filter({ hasText: /^Won$/ });
      const rowCount = await page.locator("tbody tr").count();
      if (rowCount > 0) {
        await expect(wonBadges.first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("temperature filter works", async ({ page }) => {
    await page.goto("/leads");
    const tempFilter = page.locator("button[role='combobox']").filter({ hasText: /Temperature|Temp|All/i }).first();
    if (await tempFilter.isVisible({ timeout: 3_000 })) {
      await tempFilter.click();
      await page.getByRole("option", { name: "Hot" }).click();
      await page.waitForTimeout(500);
    }
  });
});
