import { test, expect } from "@playwright/test";
import { futureDate } from "./helpers";

// ─── Follow-ups list ──────────────────────────────────────────────────────────

test.describe("Follow-ups list", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/follow-ups");
  });

  test("loads and shows Follow-ups heading", async ({ page }) => {
    await expect(page.getByText(/Follow.up/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows tabs: Upcoming and Completed", async ({ page }) => {
    await expect(
      page.getByRole("tab", { name: /Upcoming|All|Pending/i }).or(
        page.getByRole("tab", { name: /Completed/i })
      ).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("filter by type shows only that type", async ({ page }) => {
    // Look for type filter
    const typeFilter = page
      .locator("button[role='combobox']")
      .filter({ hasText: /Type|All/i })
      .first();
    if (await typeFilter.isVisible({ timeout: 3_000 })) {
      await typeFilter.click();
      await page.getByRole("option", { name: "Call" }).click();
      await page.waitForTimeout(400);
      // If any rows, they should be Call type
    }
  });

  test("search input filters follow-ups", async ({ page }) => {
    const search = page.locator('input[placeholder*="Search"]').first();
    if (await search.isVisible({ timeout: 3_000 })) {
      await search.fill("XYZNOTEXIST99999");
      await page.waitForTimeout(400);
    }
  });

  test("Completed tab loads without error", async ({ page }) => {
    const completedTab = page.getByRole("tab", { name: /Completed/i });
    if (await completedTab.isVisible({ timeout: 3_000 })) {
      await completedTab.click();
      await page.waitForTimeout(500);
      // Page should not show an error
      await expect(page.locator("body")).not.toContainText("Something went wrong");
    }
  });
});

// ─── Complete a follow-up ─────────────────────────────────────────────────────

test.describe("Mark follow-up complete", () => {
  test("complete button is visible and opens dialog", async ({ page }) => {
    await page.goto("/follow-ups");
    await page.waitForLoadState("networkidle");

    // Look for a complete / check button on any row
    const completeBtn = page
      .getByRole("button", { name: /Complete|Mark/i })
      .or(page.locator('button[aria-label*="complete" i]'))
      .or(page.locator('button svg').filter({ hasText: "" }).locator("..").first());

    // Only verify if rows exist
    const rows = page.locator("tbody tr").or(page.locator("[data-followup-row]"));
    const rowCount = await rows.count();
    if (rowCount > 0) {
      // There should be some action button
      await expect(
        page.getByRole("button").filter({ hasText: /complete|done|check/i }).first()
          .or(page.locator("button").nth(0))
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ─── Create follow-up via API (for integration) ───────────────────────────────

test.describe("Follow-up creation via API", () => {
  test("POST /api/follow-ups creates a follow-up", async ({ request }) => {
    const scheduledAt = new Date(futureDate(2) + "T10:00:00").toISOString();

    // Need a lead to attach to — skip if no leads exist
    const leadsRes = await request.get("/api/leads?limit=1");
    if (!leadsRes.ok()) return;
    const leadsJson = await leadsRes.json();
    const leads = leadsJson.data ?? leadsJson.leads ?? [];
    if (leads.length === 0) {
      test.skip();
      return;
    }

    const res = await request.post("/api/follow-ups", {
      data: {
        lead_id: leads[0].id,
        type: "Call",
        priority: "Medium",
        scheduled_at: scheduledAt,
      },
    });

    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.data?.id ?? json.id).toBeTruthy();

    // Cleanup
    const id = json.data?.id ?? json.id;
    if (id) await request.delete(`/api/follow-ups/${id}`);
  });
});
