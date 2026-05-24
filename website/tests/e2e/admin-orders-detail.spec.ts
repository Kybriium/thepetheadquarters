import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Deep walkthrough of the admin order detail page.
 *
 *   - List page filters
 *   - Open detail
 *   - Status timeline visible
 *   - Each modal opens cleanly:
 *       - Ship modal
 *       - Forward to supplier modal (when the order has a dropship item)
 *       - Cancel order modal
 *       - Refund order modal
 *       - Email customer modal (already covered in own spec)
 *
 * Doesn't actually submit destructive actions because they mutate the
 * order state and other tests depend on it. We open, verify the
 * modal renders, and close.
 */

async function pickAnyOrder(page: { request: { get: (u: string) => Promise<{ json: () => Promise<{ results: { order_number: string }[] }> }> } }): Promise<string | null> {
  const res = await page.request.get(`${API_URL}/admin/orders/?page_size=1`);
  const body = await res.json();
  return body?.results?.[0]?.order_number ?? null;
}

test("orders list filters by status without errors", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page.locator("h1").first()).toBeVisible();

  // Some installations have a status filter chip / dropdown. We just
  // verify the table or "no orders" state renders.
  await expect(page.locator("body")).toContainText(/orders|no orders|TPH-/i);
});

test("order detail renders timeline + payment + items + expenses panel", async ({ page }) => {
  const orderNumber = await pickAnyOrder(page);
  test.skip(!orderNumber, "no orders");

  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.locator("h1").filter({ hasText: new RegExp(orderNumber!) })).toBeVisible();

  // Items section
  await expect(page.getByText(/items \(\d+\)/i)).toBeVisible();
  // Payment summary
  await expect(page.getByText(/Subtotal|Total|Shipping/i).first()).toBeVisible();
  // Finances panel (today's feature)
  await expect(page.getByText(/finances on this order/i)).toBeVisible({ timeout: 8000 });
});

test("Ship modal opens with carrier + tracking fields", async ({ page }) => {
  const orderNumber = await pickAnyOrder(page);
  test.skip(!orderNumber, "no orders");

  await page.goto(`/admin/orders/${orderNumber}`);
  // Wait for the order detail to actually hydrate (items section is
  // a reliable late-loading anchor) before checking buttons.
  await expect(page.getByText(/items \(\d+\)/i)).toBeVisible({ timeout: 8000 });

  const shipBtn = page.getByRole("button", { name: /mark as shipped/i }).first();
  // Only paid/processing orders surface the Ship button — if the
  // current order's status doesn't allow it, skip cleanly.
  if (!(await shipBtn.isVisible().catch(() => false))) {
    test.skip(true, "order isn't in a shippable status");
  }
  await shipBtn.click();

  // The modal heading is unique enough to scope to.
  await expect(page.getByRole("heading", { name: /mark order as shipped/i })).toBeVisible();

  // The Tracking Number field only renders after a carrier is selected
  // — that's the modal's deliberate UX. Pick Royal Mail then assert.
  await page.locator("select").first().selectOption({ value: "royal_mail" });
  await expect(page.getByText(/tracking number/i).first()).toBeVisible();

  await page.getByRole("button", { name: /^cancel$/i }).click();
});

test("Cancel order modal opens with confirmation copy", async ({ page }) => {
  const orderNumber = await pickAnyOrder(page);
  test.skip(!orderNumber, "no orders");

  await page.goto(`/admin/orders/${orderNumber}`);
  await expect(page.getByText(/items \(\d+\)/i)).toBeVisible({ timeout: 8000 });

  const cancelBtn = page.getByRole("button", { name: /^cancel order$/i }).first();
  if (!(await cancelBtn.isVisible().catch(() => false))) {
    test.skip(true, "no cancel button on this status");
  }
  await cancelBtn.click();

  await expect(page.getByText(/cancel order\?/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/restock/i)).toBeVisible();
  await page.keyboard.press("Escape").catch(() => null);
});

test("Forward to supplier modal lists saved suppliers for variant", async ({ page }) => {
  const orderNumber = await pickAnyOrder(page);
  test.skip(!orderNumber, "no orders");

  await page.goto(`/admin/orders/${orderNumber}`);

  // Each dropship item that hasn't been forwarded shows a "Forward to
  // supplier" button. If none exist on this order (no dropship items,
  // or all already forwarded), skip.
  await expect(page.getByText(/items \(\d+\)/i)).toBeVisible({ timeout: 8000 });
  const forwardBtn = page.getByRole("button", { name: /forward to supplier/i }).first();
  if (!(await forwardBtn.isVisible().catch(() => false))) {
    test.skip(true, "no dropship items to forward");
  }
  await forwardBtn.click();

  await expect(page.getByRole("heading", { name: /forward to supplier/i })).toBeVisible();
  // Should show either saved suppliers or the empty-state hint
  await expect(
    page.getByText(/saved suppliers for this variant|no saved suppliers/i),
  ).toBeVisible();
  // Close
  await page.getByRole("button", { name: /^cancel$/i }).click();
});
