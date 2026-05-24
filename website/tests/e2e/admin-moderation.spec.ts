import { expect, test } from "@playwright/test";

/**
 * Moderation pages — reviews + contact messages list.
 *
 * Doesn't try to drive the moderation actions (hide, reply, mark read)
 * because those mutate persistent state we don't want polluting other
 * tests. Just confirms the pages render with sane structure and the
 * key calls aren't 500ing under real auth.
 */

test("admin reviews moderation page renders", async ({ page }) => {
  await page.goto("/admin/reviews");
  // Heading or empty state — either is fine
  await expect(page.locator("h1, h2").filter({ hasText: /reviews/i }).first()).toBeVisible();
});

test("admin contact messages page renders", async ({ page }) => {
  await page.goto("/admin/contact-messages");
  await expect(page.locator("h1, h2").filter({ hasText: /message/i }).first()).toBeVisible();
});

test("admin promotions page renders + shows WELCOME10", async ({ page }) => {
  await page.goto("/admin/promotions");
  await expect(page.locator("h1, h2").filter({ hasText: /promo/i }).first()).toBeVisible();
  // WELCOME10 is seeded by the local DB — assert it's listed
  await expect(page.getByText(/WELCOME10/).first()).toBeVisible({ timeout: 8000 });
});

test("admin suppliers page renders", async ({ page }) => {
  await page.goto("/admin/suppliers");
  await expect(page.locator("h1, h2").filter({ hasText: /suppliers/i }).first()).toBeVisible();
});
