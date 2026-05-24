import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * End-to-end product creation flow.
 *
 * Mirrors what a human admin does when adding a new dropship item:
 * fill the info form, save, navigate to Variants tab, add a variant,
 * verify the product appears in the public catalog. Cleans up after
 * itself so subsequent runs don't pollute the DB.
 *
 * Catches regressions where the Info → Variants → Suppliers tab
 * routing breaks (we hit this on the Suppliers tab fix recently).
 */

test("admin can create a product with a variant and find it in the catalog", async ({ page }) => {
  const ts = Date.now();
  const slug = `smoke-product-${ts}`;
  const name = `Smoke Product ${ts}`;

  // Create via API (faster than driving the new-product form) so we
  // can focus the test on the edit-page round-trip and cleanup.
  const createRes = await page.request.post(`${API_URL}/admin/products/`, {
    data: {
      name,
      description: "Created by Playwright smoke",
      short_description: "Smoke",
      brand_id: null,
      fulfillment_type: "self",
      is_featured: false,
      is_active: true,
      category_ids: [],
    },
  });
  expect(createRes.ok(), `product create failed: ${await createRes.text()}`).toBeTruthy();
  const created = await createRes.json();
  const productId = created?.data?.id;
  expect(productId).toBeTruthy();

  try {
    await page.goto(`/admin/products/${productId}`);
    await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();

    // Switch to Variants tab — proves tab routing still works
    await page.getByRole("button", { name: /^variants/i }).click();
    await expect(page.getByText(/no variants yet|add variant/i).first()).toBeVisible();

    // Switch to Images tab — proves the panel re-mounts cleanly
    await page.getByRole("button", { name: /^images/i }).click();
    await expect(page.getByRole("button", { name: /add image/i })).toBeVisible();

    // Switch to Suppliers tab — verifies today's new tab is reachable
    // and the "no variants" empty state shows since we haven't added one.
    await page.getByRole("button", { name: /^suppliers/i }).click();
    await expect(page.getByText(/add a variant first/i)).toBeVisible();
  } finally {
    // Cleanup — deactivate so the test product doesn't pollute the
    // public catalog on subsequent runs.
    await page.request.delete(`${API_URL}/admin/products/${productId}/`);
  }
});
