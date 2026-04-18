import { type Page, type APIRequestContext } from "@playwright/test";

/** Returns a YYYY-MM-DD date that is `days` from today */
export function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Returns the JS day-of-week (0=Sun…6=Sat) for a given YYYY-MM-DD string */
export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

/** Map JS day index to the display label used in the day-chip row */
export const DAY_LABEL = ["S", "M", "T", "W", "T", "F", "S"];

/** Clicks the nth element matching a selector (0-indexed) */
export async function clickNth(page: Page, selector: string, n: number) {
  await page.locator(selector).nth(n).click();
}

/**
 * Opens a Radix/shadcn Select by clicking its trigger (found by the label text
 * immediately above it) and then clicking the desired option text.
 */
export async function selectOption(page: Page, labelText: string, optionText: string) {
  const field = page.locator(`label:has-text("${labelText}")`).locator("..").locator("button[role='combobox']");
  await field.click();
  await page.getByRole("option", { name: optionText }).click();
}

/**
 * Deletes all test bookings whose client_name contains the given prefix.
 * Uses the API directly so tests can clean up after themselves.
 */
export async function cleanupTestBookings(request: APIRequestContext, prefix = "E2E-TEST") {
  const res = await request.get(`/api/podcast-studio/bookings?search=${encodeURIComponent(prefix)}&limit=100`);
  if (!res.ok()) return;
  const { data } = await res.json();
  for (const b of data ?? []) {
    await request.delete(`/api/podcast-studio/bookings/${b.id}`);
  }
}
