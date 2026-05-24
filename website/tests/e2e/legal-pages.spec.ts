import { expect, test } from "@playwright/test";

/**
 * Legal pages — assert the new UK-compliance clauses are actually
 * rendered. Picks specific phrases that would only be in the policy
 * if the right clauses were copied across, so a refactor that drops
 * sections fails loudly here.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("privacy policy includes age and children clauses", async ({ page }) => {
  await page.goto("/legal/privacy");
  await expect(page.getByRole("heading", { name: /privacy policy/i })).toBeVisible();
  // 18+ to order
  await expect(page.locator("body")).toContainText(/at least 18 years old to place an order/i);
  // 13+ for accounts (UK GDPR Art 8)
  await expect(page.locator("body")).toContainText(/create an account from age 13/i);
  // Under-13 deletion right
  await expect(page.locator("body")).toContainText(/under 13/i);
});

test("privacy policy lists every current subprocessor", async ({ page }) => {
  await page.goto("/legal/privacy");
  for (const name of ["Stripe", "Resend", "Cloudinary", "Railway", "Cloudflare", "Telegram"]) {
    await expect(page.locator("body")).toContainText(name);
  }
});

test("privacy policy retention period matches HMRC", async ({ page }) => {
  await page.goto("/legal/privacy");
  // HMRC's actual minimum for limited companies is 6 years from end of
  // the accounting period the records relate to.
  await expect(page.locator("body")).toContainText(/6 years from the end of the accounting period/i);
});

test("terms include eligibility (18+) and reviews + acceptable use", async ({ page }) => {
  await page.goto("/legal/terms");
  await expect(page.getByRole("heading", { name: /terms.*conditions/i })).toBeVisible();
  await expect(page.locator("body")).toContainText(/Eligibility/i);
  await expect(page.locator("body")).toContainText(/at least 18 years old/i);
  await expect(page.locator("body")).toContainText(/Reviews and user-generated content/i);
  await expect(page.locator("body")).toContainText(/Acceptable use/i);
  // DMCC Act 2024 reference for fake-reviews ban
  await expect(page.locator("body")).toContainText(/Digital Markets, Competition and Consumers Act 2024/i);
});

test("cookies policy references the age requirement and HttpOnly cookies", async ({ page }) => {
  await page.goto("/legal/cookies");
  await expect(page.getByRole("heading", { name: /cookies/i }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/HttpOnly/i);
  await expect(page.locator("body")).toContainText(/children/i);
});
