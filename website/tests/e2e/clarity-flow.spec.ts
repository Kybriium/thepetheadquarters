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
