import { expect, test } from "@playwright/test";

/**
 * Inventory + procurement + suppliers + customers — page-level smoke
 * for each admin landing route. We check the page renders the expected
 * primary header / table / empty state without 500ing.
 *
 * Deep CRUD on these is already covered by the bash smoke; here we
 * just confirm the UI mounts and the data renders.
 */

const ADMIN_PAGES: { path: string; expect: RegExp }[] = [
  { path: "/admin/inventory", expect: /inventory|stock/i },
  { path: "/admin/customers", expect: /customer/i },
  { path: "/admin/suppliers", expect: /supplier/i },
  { path: "/admin/purchase-orders", expect: /purchase order|order/i },
  { path: "/admin/brands", expect: /brand/i },
  { path: "/admin/categories", expect: /categor/i },
  { path: "/admin/promotions", expect: /promotion|discount/i },
  { path: "/admin/reviews", expect: /review/i },
  { path: "/admin/contact-messages", expect: /message/i },
  { path: "/admin/analytics", expect: /analytic|visitor|traffic/i },
  { path: "/admin/reports", expect: /report/i },
  { path: "/admin/audit", expect: /audit/i },
  { path: "/admin/finances", expect: /finance|revenue|expense/i },
  { path: "/admin/option-types", expect: /option|axis|variant/i },
  { path: "/admin/customizations", expect: /customi/i },
  { path: "/admin/integrations", expect: /integration|telegram/i },
];

for (const p of ADMIN_PAGES) {
  test(`admin page ${p.path} renders`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("response", (r) => {
      if (r.status() >= 500 && r.url().includes(":3000")) {
        errors.push(`5XX ${r.status()} ${r.url()}`);
      }
    });

    const res = await page.goto(p.path);
    expect(res?.status(), `${p.path} returned ${res?.status()}`).toBeLessThan(400);

    await expect(page.locator("body")).toContainText(p.expect, { timeout: 8000 });
    expect(errors, `errors on ${p.path}:\n${errors.join("\n")}`).toHaveLength(0);
  });
}

test("admin dashboard shows revenue + net cards", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText(/today's revenue/i)).toBeVisible();
  await expect(page.getByText(/today's net|net profit/i)).toBeVisible();
});

test("admin orders list renders with table or empty state", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page.locator("body")).toContainText(/orders|no orders|TPH-/i);
});
