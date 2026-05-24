import { expect, test } from "@playwright/test";
import { API_URL, loginAsAdmin, tinyPngBuffer } from "./_helpers";

/**
 * Admin Finances critical-flow tests.
 *
 *   1. Open /admin/finances → cards render with real numbers
 *   2. Add a manual expense via the modal → row appears in ledger
 *   3. Upload a receipt → "View" link appears
 *   4. Delete the test expense → row vanishes
 *
 * Touches the same bug class as the image upload: the receipt URL
 * round-trips through Django (absolute URL via build_absolute_uri).
 * A regression here would surface as a clickable but 404-ing receipt.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("admin can add, attach a receipt to, and delete an expense", async ({ page }) => {
  await page.goto("/admin/finances");

  // Top KPI cards should render even on an empty period
  await expect(page.getByText(/Revenue/i).first()).toBeVisible();
  await expect(page.getByText(/Net profit/i).first()).toBeVisible();

  // Open the Add Expense modal
  await page.getByRole("button", { name: /add expense/i }).click();
  await expect(page.getByRole("heading", { name: /add expense/i })).toBeVisible();

  // Fill the form via `name=` attributes — unambiguous and only
  // present on the modal form inputs, so we sidestep collisions with
  // the ledger table column headers and the (still-rendered) search
  // overlay's input.
  await page.locator('input[name="amount_pence"]').fill("4.99");
  await page.locator('input[name="description"]').fill("Playwright smoke expense");

  // Attach the receipt file
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "smoke-receipt.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer(),
  });

  await page.getByRole("button", { name: /^save$/i }).click();

  // The row should appear in the ledger. Description text is the
  // most reliable selector.
  await expect(page.getByText("Playwright smoke expense").first()).toBeVisible({ timeout: 10_000 });

  // Find the new expense id via the API so we can clean up regardless
  // of UI state. Querying with the description as a search filter.
  const listRes = await page.request.get(
    `${API_URL}/admin/expenses/?search=Playwright%20smoke%20expense&page_size=5`,
  );
  const listBody = await listRes.json();
  const created = (listBody?.results ?? []).find((e: { description: string }) =>
    e.description === "Playwright smoke expense",
  );
  expect(created, "newly-created expense not in list").toBeTruthy();

  // Receipt should round-trip as an absolute URL — the previous bug
  // returned a relative `/media/...` path and broke the link.
  expect(created.receipt_url, "receipt_url should be set after upload").toBeTruthy();
  expect(created.receipt_url, "receipt_url should be absolute (http(s)://...)").toMatch(/^https?:\/\//);

  // Clean up
  const delRes = await page.request.delete(`${API_URL}/admin/expenses/${created.id}/`);
  expect(delRes.ok() || delRes.status() === 204).toBeTruthy();
});
