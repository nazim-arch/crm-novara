import { test, expect } from "@playwright/test";

// ─── User Management ──────────────────────────────────────────────────────────

test.describe("Settings - User Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/users");
  });

  test("loads User Management page", async ({ page }) => {
    await expect(page.getByText("User Management")).toBeVisible({ timeout: 10_000 });
  });

  test("shows user list with name and role columns", async ({ page }) => {
    await expect(
      page.getByText(/Name|Email|Role/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("shows Invite User or New User button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Invite|New User|Add User/i })
        .or(page.getByRole("link", { name: /Invite|New User|Add User/i }))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("user rows show role badges", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    // Should have at least one user with a role badge
    await expect(
      page.getByText(/Admin|Sales|Manager|Operations|Viewer/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Settings - Clients ───────────────────────────────────────────────────────

test.describe("Settings - Clients", () => {
  test("loads clients list", async ({ page }) => {
    await page.goto("/settings/clients");
    await expect(
      page.getByText(/Clients|Client Management/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("New Client button is present", async ({ page }) => {
    await page.goto("/settings/clients");
    await expect(
      page.getByRole("button", { name: /New Client|Add Client/i })
        .or(page.getByRole("link", { name: /New Client|Add Client/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Profile Settings ────────────────────────────────────────────────────────

test.describe("Settings - Profile", () => {
  test("loads profile page", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(
      page.getByText(/Profile|My Account|Account Settings/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
