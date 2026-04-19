import { type Page, type APIRequestContext } from "@playwright/test";

/** Returns a YYYY-MM-DD date that is `days` from today */
export function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Returns a YYYY-MM-DD date that is `days` before today */
export function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/**
 * Opens a Radix/shadcn Select by clicking the trigger found by its label text
 * and then clicking the desired option.
 */
export async function selectOption(page: Page, labelText: string, optionText: string) {
  const field = page
    .locator(`label:has-text("${labelText}")`)
    .locator("..")
    .locator("button[role='combobox']");
  await field.click();
  await page.getByRole("option", { name: optionText }).click();
}

/** Waits for a toast message containing the given text */
export async function waitForToast(page: Page, text: string | RegExp) {
  await page.locator("[data-sonner-toast]").filter({ hasText: text }).waitFor({ timeout: 8_000 });
}

/** Deletes all test records via the search API */
export async function cleanupTestLeads(request: APIRequestContext, prefix = "E2E-TEST") {
  const res = await request.get(`/api/leads?search=${encodeURIComponent(prefix)}&limit=100`);
  if (!res.ok()) return;
  const json = await res.json();
  const leads = json.data ?? json.leads ?? [];
  for (const l of leads) {
    await request.delete(`/api/leads/${l.id}`);
  }
}

export async function cleanupTestTasks(request: APIRequestContext, prefix = "E2E-TEST") {
  const res = await request.get(`/api/tasks?search=${encodeURIComponent(prefix)}&limit=100`);
  if (!res.ok()) return;
  const json = await res.json();
  for (const t of json.data ?? []) {
    await request.delete(`/api/tasks/${t.id}`);
  }
}

export async function cleanupTestOpportunities(request: APIRequestContext, prefix = "E2E-TEST") {
  const res = await request.get(`/api/opportunities?search=${encodeURIComponent(prefix)}&limit=100`);
  if (!res.ok()) return;
  const json = await res.json();
  for (const o of json.data ?? []) {
    await request.delete(`/api/opportunities/${o.id}`);
  }
}
