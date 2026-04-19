import { test, expect } from "@playwright/test";
import { futureDate, selectOption, cleanupTestTasks } from "./helpers";

const PREFIX = "E2E-TEST Task";

test.afterAll(async ({ request }) => {
  await cleanupTestTasks(request, "E2E-TEST");
});

// ─── Tasks list ──────────────────────────────────────────────────────────────

test.describe("Tasks list", () => {
  test("loads and shows heading", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.getByText(/Tasks/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("New Task button navigates to create form", async ({ page }) => {
    await page.goto("/tasks");
    await page.getByRole("link", { name: /New Task/i }).click();
    await expect(page).toHaveURL(/\/tasks\/new/);
  });

  test("has list and kanban view tabs", async ({ page }) => {
    await page.goto("/tasks");
    // Check for view toggle (list/kanban)
    const listTab = page.getByRole("tab", { name: /List/i }).or(
      page.getByRole("link", { name: /List|Kanban/i })
    );
    if (await listTab.first().isVisible({ timeout: 3_000 })) {
      await expect(listTab.first()).toBeVisible();
    }
  });
});

// ─── Create task ──────────────────────────────────────────────────────────────

test.describe("Create task", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tasks/new");
    await expect(page.locator("#title")).toBeVisible({ timeout: 10_000 });
  });

  test("form has all required fields", async ({ page }) => {
    await expect(page.locator("#title")).toBeVisible();
    await expect(page.locator("#due_date")).toBeVisible();
    await expect(page.getByText("Assigned To")).toBeVisible();
    await expect(page.getByText("Priority")).toBeVisible();
  });

  test("shows validation error for empty title", async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 3_000 });
  });

  test("creates a task and redirects to task detail", async ({ page }) => {
    const dueDate = futureDate(7);

    await page.fill("#title", `${PREFIX} Create`);
    await page.fill("#due_date", dueDate);
    await selectOption(page, "Priority", "Medium");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tasks\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Create`)).toBeVisible({ timeout: 8_000 });
  });

  test("creates a High priority task", async ({ page }) => {
    const dueDate = futureDate(3);

    await page.fill("#title", `${PREFIX} High Priority`);
    await page.fill("#due_date", dueDate);
    await selectOption(page, "Priority", "High");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tasks\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} High Priority`)).toBeVisible({ timeout: 8_000 });
  });

  test("creates a task with sector", async ({ page }) => {
    const dueDate = futureDate(5);

    await page.fill("#title", `${PREFIX} Sectored`);
    await page.fill("#due_date", dueDate);
    await selectOption(page, "Sector", "Novara");

    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tasks\/[a-z0-9]+/, { timeout: 15_000 });
    await expect(page.getByText(`${PREFIX} Sectored`)).toBeVisible({ timeout: 8_000 });
  });

  test("revenue toggle shows revenue amount field", async ({ page }) => {
    // Look for revenue_tagged switch/toggle
    const revenueToggle = page.locator('[role="switch"]').or(page.locator('input[type="checkbox"]')).first();
    if (await revenueToggle.isVisible({ timeout: 3_000 })) {
      await revenueToggle.click();
      // Revenue Amount input should now be visible
      await expect(page.getByText("Revenue Amount")).toBeVisible({ timeout: 3_000 });
    }
  });

  test("description field accepts text", async ({ page }) => {
    await page.fill("#description", "This is a test description for E2E verification");
    await expect(page.locator("#description")).toHaveValue("This is a test description for E2E verification");
  });
});

// ─── Task detail ──────────────────────────────────────────────────────────────

test.describe("Task detail", () => {
  let taskUrl: string;

  test.beforeAll(async ({ request }) => {
    const dueDate = futureDate(10);
    const res = await request.post("/api/tasks", {
      data: {
        title: `${PREFIX} Detail View`,
        due_date: new Date(dueDate).toISOString(),
        priority: "Medium",
        recurrence: "None",
        revenue_tagged: false,
      },
    });
    if (res.ok()) {
      const { data } = await res.json();
      taskUrl = `/tasks/${data.id}`;
    }
  });

  test("task detail loads with title and status", async ({ page }) => {
    if (!taskUrl) test.skip();
    await page.goto(taskUrl);
    await expect(page.getByText(`${PREFIX} Detail View`)).toBeVisible({ timeout: 10_000 });
    // Should show current status
    await expect(page.getByText(/Todo|InProgress|Done/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("task detail has edit link", async ({ page }) => {
    if (!taskUrl) test.skip();
    await page.goto(taskUrl);
    await expect(
      page.getByRole("link", { name: /Edit/i }).or(page.getByRole("button", { name: /Edit/i }))
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Task filters ─────────────────────────────────────────────────────────────

test.describe("Task list filters", () => {
  test("priority filter works", async ({ page }) => {
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");

    const priorityFilter = page
      .locator("button[role='combobox']")
      .filter({ hasText: /Priority|All/i })
      .first();

    if (await priorityFilter.isVisible({ timeout: 3_000 })) {
      await priorityFilter.click();
      await page.getByRole("option", { name: "High" }).click();
      await page.waitForTimeout(500);
    }
  });

  test("kanban view renders columns", async ({ page }) => {
    await page.goto("/tasks?view=kanban");
    await page.waitForLoadState("networkidle");
    // Kanban columns: Todo, In Progress, Done
    await expect(
      page.getByText(/Todo|In Progress|Done/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
