import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("cookie notice appears for new visitor and Clarity tag is absent until accept", async ({ page }) => {
  await page.goto("/");
  // Banner is delayed 800ms — wait for it
  const banner = page.getByRole("dialog", { name: /cookies/i });
  await expect(banner).toBeVisible({ timeout: 5000 });

  // The Clarity tag should NOT be present yet — we haven't consented
  const clarityScript = page.locator('script#ms-clarity, script[src*="clarity.ms/tag/"]');
  await expect(clarityScript).toHaveCount(0);

  // Accept all
  await page.getByRole("button", { name: /accept all/i }).click();
  await expect(banner).toBeHidden();

  // localStorage should record the choice
  const consent = await page.evaluate(() => localStorage.getItem("tph-cookie-consent"));
  expect(consent).toBe("all");
});

test("after accepting, Clarity tag injects and loads the remote script", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /cookies/i });
  await expect(banner).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /accept all/i }).click();
  await expect(banner).toBeHidden();

  // The next/script inline snippet should now be on the page
  await expect(page.locator("script#ms-clarity")).toHaveCount(1, { timeout: 5000 });

  // And the snippet should have appended a <script src="clarity.ms/tag/..."> tag.
  // This proves the project ID flowed through the env var into the page.
  await expect(page.locator('script[src*="clarity.ms/tag/"]')).toHaveCount(1, {
    timeout: 5000,
  });
});

test("declining keeps Clarity disabled and stores 'necessary'", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /cookies/i });
  await expect(banner).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /necessary only/i }).click();
  await expect(banner).toBeHidden();
  const consent = await page.evaluate(() => localStorage.getItem("tph-cookie-consent"));
  expect(consent).toBe("necessary");
  // Should NOT inject Clarity
  const clarityScript = page.locator('script#ms-clarity, script[src*="clarity.ms/tag/"]');
  await expect(clarityScript).toHaveCount(0);
});
