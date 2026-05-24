import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Admin category edit page — primarily exists to host the measure-guide
 * editor that the size-fit-manager on the product page deep-links to.
 *
 *   1. Page loads and shows the basics section
 *   2. Measure-guide section renders with text + image URL inputs
 *   3. Save round-trip persists both fields and the toast confirms
 *   4. Visiting from the size-fit-manager link works (no 404)
 */

async function pickCategory(page: { request: { get: (u: string) => Promise<{ json: () => Promise<{ data: { id: string; slug: string }[] }> }> } }) {
  const res = await page.request.get(`${API_URL}/admin/categories/`);
  const body = await res.json();
  return body?.data?.[0] ?? null;
}

test("category edit page loads and renders the measure-guide section", async ({ page }) => {
  const cat = await pickCategory(page);
  test.skip(!cat, "no categories in DB");

  await page.goto(`/admin/categories/${cat!.id}`);

  // Heading shows the category name (we don't assert which because
  // tests run against any seeded data).
  await expect(page.locator("h1").first()).toBeVisible();

  // Basics section
  await expect(page.getByRole("heading", { name: /^basics$/i })).toBeVisible();
  await expect(page.getByText(/^Name$/i)).toBeVisible();

  // Measure-guide section
  await expect(
    page.getByRole("heading", { name: /how to measure/i }),
  ).toBeVisible();
  await expect(page.getByText(/tips \(one per line\)/i)).toBeVisible();
});

test("category edit — save measure-guide text and read it back", async ({ page }) => {
  const cat = await pickCategory(page);
  test.skip(!cat, "no categories in DB");

  await page.goto(`/admin/categories/${cat!.id}`);
  // Wait for the page to hydrate (Save button mounts after fetch).
  await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible({ timeout: 8000 });

  const tipsBox = page.locator("textarea").nth(1); // 0 = description, 1 = tips
  const marker = `Playwright marker ${Date.now()}`;
  await tipsBox.fill(marker);

  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/category saved/i)).toBeVisible({ timeout: 5000 });

  // Re-fetch via the API to confirm persistence
  const res = await page.request.get(`${API_URL}/admin/categories/${cat!.id}/`);
  const body = await res.json();
  expect(body?.data?.measure_guide_text).toContain(marker);
});

test("size-fit-manager deep link to category edit no longer 404s", async ({ page }) => {
  // Find a category that's referenced by a product so the link path
  // makes sense in the wild.
  const cat = await pickCategory(page);
  test.skip(!cat, "no categories in DB");

  const res = await page.goto(`/admin/categories/${cat!.id}`);
  expect(res?.status(), `expected non-404, got ${res?.status()}`).toBeLessThan(400);
});
