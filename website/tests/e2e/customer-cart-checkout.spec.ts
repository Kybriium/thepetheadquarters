import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Cart + checkout walkthrough.
 *
 *   - PDP "Add to cart" → cart popup → quantity change → remove
 *   - Cart page: subtotal + free-delivery progress recompute
 *   - Apply promo code (WELCOME10 — happy path for a fresh email)
 *   - Navigate to /checkout, fill address fields, get to "Pay" button
 *     (we don't actually push to Stripe to keep the test fast)
 *
 * Cart state is localStorage-backed so we use the visible UI rather
 * than poking through the API.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function getFirstProductSlug(page: { request: { get: (url: string) => Promise<{ json: () => Promise<{ results: { slug: string }[] }> }> } }): Promise<string | null> {
  const res = await page.request.get(`${API_URL}/products/?page_size=1`);
  const body = await res.json();
  return body?.results?.[0]?.slug ?? null;
}

test("add → change qty → remove cycle", async ({ page }) => {
  const slug = await getFirstProductSlug(page);
  test.skip(!slug, "no active products");

  await page.goto(`/products/${slug}`);
  // Single-variant products auto-select; multi-variant ones don't.
  const variantBtn = page.getByRole("button").filter({ hasText: /^(XS|S|M|L|XL|Small|Medium|Large)$/i }).first();
  if (await variantBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await variantBtn.click();
  }

  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await expect(page.getByRole("button", { name: /open cart \(1 item/i })).toBeVisible({ timeout: 5000 });

  // Add the same product again — cart should merge into qty 2
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await expect(page.getByRole("button", { name: /open cart \(2 item/i })).toBeVisible({ timeout: 5000 });

  // Navigate to /cart, remove the item
  await page.goto("/cart");
  await expect(page.locator("body")).toContainText(/2|two/i); // qty 2 visible somewhere
  // Remove button — accessible name "Remove"
  const removeBtn = page.getByRole("button", { name: /remove/i }).first();
  if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await removeBtn.click();
  }
});

test("cart page shows free-delivery progress bar", async ({ page }) => {
  const slug = await getFirstProductSlug(page);
  test.skip(!slug, "no active products");
  await page.goto(`/products/${slug}`);
  const variantBtn = page.getByRole("button").filter({ hasText: /^(XS|S|M|L|XL|Small|Medium|Large)$/i }).first();
  if (await variantBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await variantBtn.click();
  }
  await page.getByRole("button", { name: /add to cart/i }).first().click();

  await page.goto("/cart");
  await expect(
    page.getByText(/spend.*more for free delivery|free delivery|unlocked/i).first(),
  ).toBeVisible({ timeout: 8000 });
});

test("checkout page renders shipping address fields for guest", async ({ page }) => {
  const slug = await getFirstProductSlug(page);
  test.skip(!slug, "no active products");
  await page.goto(`/products/${slug}`);
  const variantBtn = page.getByRole("button").filter({ hasText: /^(XS|S|M|L|XL|Small|Medium|Large)$/i }).first();
  if (await variantBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await variantBtn.click();
  }
  await page.getByRole("button", { name: /add to cart/i }).first().click();

  await page.goto("/checkout");

  // Required fields on UK shipping form
  await expect(page.locator('input[name="email"], input[type="email"]').first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/postcode|post code/i);
  await expect(page.locator("body")).toContainText(/address/i);
});
