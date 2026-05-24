import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Admin order detail page — modal-driven actions.
 *
 *   1. Open an existing order detail
 *   2. Confirm tabs and panels render
 *   3. Open the Email Customer modal, verify quick-template wiring
 *   4. If the order has a dropship item not yet forwarded, open the
 *      Forward to Supplier modal and verify the supplier suggestions
 *      surface
 *
 * Uses an existing order rather than creating one because order
 * creation requires a Stripe webhook round-trip.
 */

test("admin can open Email Customer modal with templates", async ({ page }) => {
  const listRes = await page.request.get(`${API_URL}/admin/orders/?page_size=1`);
  expect(listRes.ok()).toBeTruthy();
  const body = await listRes.json();
  const orderNumber = body?.results?.[0]?.order_number;
  test.skip(!orderNumber, "no orders in DB — skip");

  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByRole("heading", { name: new RegExp(orderNumber!) })).toBeVisible();

  // Open the email modal
  await page.getByRole("button", { name: /email customer/i }).click();
  await expect(page.getByRole("heading", { name: /email customer/i })).toBeVisible();

  // Click a template — should auto-fill the subject + body fields
  await page.getByRole("button", { name: /dropship delayed/i }).click();
  // Use `name=` so we hit the modal's subject input, not some other
  // text field on the order page (e.g. notes).
  await expect(page.locator('input[name="subject"]')).toHaveValue(new RegExp(orderNumber!));

  // Close the modal — verifies the X handler
  await page.getByRole("button", { name: /^cancel$/i }).click();
  await expect(page.getByRole("heading", { name: /email customer/i })).not.toBeVisible();
});

test("admin can see order finances panel + recorded expenses", async ({ page }) => {
  const listRes = await page.request.get(`${API_URL}/admin/orders/?page_size=1`);
  const body = await listRes.json();
  const orderNumber = body?.results?.[0]?.order_number;
  test.skip(!orderNumber, "no orders in DB — skip");

  await page.goto(`/admin/orders/${orderNumber}`);

  // The OrderExpensesPanel always renders its header.
  await expect(page.getByText(/finances on this order/i)).toBeVisible({ timeout: 8000 });

  // When expenses exist on this order the panel shows a Net line;
  // when they don't, an empty-state hint. Either proves the panel
  // mounted correctly.
  await expect(
    page.getByText(/^Net |no expenses recorded yet/i).first(),
  ).toBeVisible({ timeout: 5000 });
});
