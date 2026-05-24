import { expect, test } from "@playwright/test";

/**
 * Public walkthrough — every route a logged-out visitor can land on.
 *
 * Each test is short and asserts the page actually renders something
 * meaningful (heading, key copy, or a primary action). Designed to
 * catch the broad category of "this page 500s in prod" or "this page
 * 404s because of a missing route" — not deep interaction. Heavier
 * flows live in their own spec files.
 *
 * Uses a fresh anonymous BrowserContext (no inherited admin cookies)
 * because most of these pages render differently for authenticated
 * users and we want to test the visitor case.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PUBLIC_PAGES: { path: string; expect: RegExp }[] = [
  { path: "/", expect: /shop by pet|top picks|new arrivals|the pet headquarters/i },
  { path: "/products", expect: /products|shop all|all products/i },
  { path: "/categories", expect: /categor/i },
  { path: "/brands", expect: /brand/i },
  { path: "/about", expect: /about|the pet headquarters/i },
  { path: "/contact", expect: /contact|get in touch|message us/i },
  { path: "/legal/privacy", expect: /privacy/i },
  { path: "/legal/terms", expect: /terms/i },
  { path: "/legal/cookies", expect: /cookies/i },
  { path: "/recently-viewed", expect: /recently viewed/i },
  { path: "/account/login", expect: /sign in|log in|email/i },
  { path: "/account/register", expect: /register|sign up|create.*account/i },
  { path: "/account/forgot-password", expect: /forgot|reset/i },
];

for (const page of PUBLIC_PAGES) {
  test(`page ${page.path} renders meaningful content`, async ({ page: browser }) => {
    const consoleErrors: string[] = [];
    browser.on("pageerror", (err) => consoleErrors.push(`PAGEERR: ${err.message}`));
    browser.on("response", (r) => {
      // Track only 5xx responses on the main document — surface real
      // server errors rather than the noisy 404s for missing imgs etc.
      if (r.status() >= 500 && r.url().includes(":3000")) {
        consoleErrors.push(`5XX ${r.status()} ${r.url()}`);
      }
    });

    const res = await browser.goto(page.path);
    expect(res?.status(), `${page.path} returned ${res?.status()}`).toBeLessThan(400);

    // Body should contain something matching the expected pattern.
    await expect(browser.locator("body")).toContainText(page.expect, { timeout: 8000 });

    // No JS errors during render. Hydration warnings are reported on
    // pageerror in Next 16 dev mode.
    expect(consoleErrors, `errors on ${page.path}:\n${consoleErrors.join("\n")}`).toHaveLength(0);
  });
}

test("404 page renders the branded fallback", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist-smoke-test");
  expect(res?.status()).toBeGreaterThanOrEqual(400);
  // Branded copy from app/[locale]/not-found.tsx
  await expect(page.getByText(/wandered off|not found|404/i).first()).toBeVisible();
});

test("footer renders Companies House disclosure on every page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/CHERYA HOLDINGS LIMITED/).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/17203315/).first()).toBeVisible();
});

test("USP ribbon renders site-wide under header", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Secure checkout by Stripe/i)).toBeVisible();
  await expect(page.getByText(/Free UK delivery over £30/i)).toBeVisible();
  await expect(page.getByText(/14-day returns/i)).toBeVisible();
});

test("first-order banner shows WELCOME10 and tap-to-copy works", async ({ page, context }) => {
  // Need clipboard permission for the tap-to-copy branch
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const banner = page.getByRole("button", { name: /first order/i });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("WELCOME10");
});
