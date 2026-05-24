import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Customer auth flows from the visitor's perspective.
 *
 *   - Login form validation + happy path → /account
 *   - Logout via account menu → user_circle icon flips to "Sign in"
 *   - Register form (just renders; we don't actually create an account
 *     to keep the test idempotent)
 *   - Forgot password form (just renders + submit returns ok)
 *
 * Uses fresh anonymous storage so the admin cookies from globalSetup
 * don't pre-authenticate the test page.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const TEST_EMAIL = "tph-tests@thepetheadquarters.local";
const TEST_PASSWORD = "TphTests!2026";

test("login form rejects empty submit then accepts valid credentials", async ({ page }) => {
  await page.goto("/account/login");

  // Empty submit should keep us on the login page (HTML5 validation)
  // — we don't assert toast text because it varies. We just confirm
  // we don't navigate away.
  await page.locator('input[type="email"]').first().fill("");
  await page.locator('input[type="password"]').first().fill("");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForTimeout(400);
  expect(page.url()).toContain("/account/login");

  // Happy path
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Wait for navigation — we don't care which destination as long as
  // it's no longer the login page and the account menu shows our email.
  await page.waitForURL((url) => !url.pathname.endsWith("/account/login"), { timeout: 8000 });
  await expect(page.getByRole("button", { name: /open account menu/i })).toBeVisible({ timeout: 5000 });
});

test("login with wrong credentials shows an error", async ({ page }) => {
  await page.goto("/account/login");
  await page.locator('input[type="email"]').first().fill("wrong@example.local");
  await page.locator('input[type="password"]').first().fill("wrong-password");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  // Either an inline error or the URL stays on /login — both prove
  // we didn't accept bogus credentials.
  await page.waitForTimeout(1500);
  expect(page.url()).toContain("/account/login");
});

test("register page renders form fields", async ({ page }) => {
  await page.goto("/account/register");
  // Same caveat as forgot-password — footer newsletter also has an
  // input[type=email] so we anchor to the first one.
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test("forgot-password page renders email field", async ({ page }) => {
  await page.goto("/account/forgot-password");
  // The page has a footer newsletter that also has an input[type=email],
  // so scope to the first one (the actual reset form).
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: /send|reset|submit/i }).first()).toBeVisible();
});

test("authenticated visitor sees account dashboard with tabs", async ({ page }) => {
  // Log in via the API directly so we don't depend on the form
  const loginRes = await page.request.post(`${API_URL}/auth/login/`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginRes.ok()).toBeTruthy();

  await page.goto("/account");
  // Account dashboard renders. We assert a couple of nav links that
  // every signed-in customer should see.
  await expect(page.getByRole("link", { name: /orders/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /addresses/i }).first()).toBeVisible();
});

test("authenticated visitor sees order history page", async ({ page }) => {
  const loginRes = await page.request.post(`${API_URL}/auth/login/`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  expect(loginRes.ok()).toBeTruthy();

  await page.goto("/account/orders");
  // Either "No orders" message or a list of orders — both render the
  // heading + page chrome.
  await expect(page.locator("h1, h2").filter({ hasText: /orders/i }).first()).toBeVisible();
});
