import { expect, test } from "@playwright/test";
import { API_URL, loginAsAdmin, tinyPngBuffer } from "./_helpers";

/**
 * Regression test for the bug we just fixed:
 *
 *   1. Admin clicks "Upload image" on a product detail page.
 *   2. Frontend POSTs the file to /admin/upload/image/.
 *   3. Returns a URL.
 *   4. Frontend POSTs that URL to /admin/products/<id>/images/ to
 *      register the ProductImage row.
 *
 * Previously step 4 returned 422 because the local-storage path of
 * step 1 produced a relative URL that the URLField validator on
 * step 4 rejected. This test would have caught that immediately.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("uploading a product image succeeds end-to-end", async ({ page }) => {
  // Pull a real product id from the admin API so we don't have to
  // hardcode anything that might drift.
  const listRes = await page.request.get(`${API_URL}/admin/products/?page_size=1`);
  expect(listRes.ok(), "couldn't list admin products").toBeTruthy();
  const listBody = await listRes.json();
  const productId = listBody?.results?.[0]?.id;
  test.skip(!productId, "no products in DB — seed the catalog first");

  await page.goto(`/admin/products/${productId}`);

  // Switch to the Images tab — the tab is a real button with text
  // "images" (lowercased + capitalised via CSS).
  await page.getByRole("button", { name: /^images/i }).click();

  // Click the "Add Image" entrypoint that reveals the upload form.
  await page.getByRole("button", { name: /^add image$/i }).click();

  // Listen for the register response BEFORE triggering the upload
  // because the chain (upload → register) fires in <1s and we don't
  // want to race the listener.
  const registerCallPromise = page.waitForResponse(
    (r) =>
      r.url().includes(`/admin/products/${productId}/images/`) &&
      r.request().method() === "POST",
    { timeout: 15_000 },
  );

  // The hidden <input type=file>. Playwright can set files on it
  // directly without simulating the click on the visible button.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer(),
  });

  const response = await registerCallPromise;
  expect(response.status(), `image register call returned ${response.status()}: ${await response.text()}`).toBeLessThan(300);
});
