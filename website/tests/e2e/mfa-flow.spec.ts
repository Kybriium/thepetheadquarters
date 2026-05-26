import { expect, test, request as playwrightRequest, type Page } from "@playwright/test";
import { generateSync } from "otplib";
import { API_URL } from "./_helpers";

/**
 * End-to-end coverage for the 2FA enrollment + login flow.
 *
 * One mega-test. Consolidated because each `await createFreshCustomer()`
 * hits the public /auth/register/ throttle (5/min/IP) and running
 * several small tests back-to-back blows past that limit on re-runs.
 *
 * Walks the full life-cycle for a throwaway customer:
 *   1. Register + login (no MFA yet)
 *   2. Open the wizard, scrape the secret, compute TOTP, enrol
 *   3. Backup codes shown on step 5, screenshot them
 *   4. Status page now says ON
 *   5. Logout, log back in — second step appears
 *   6. Submit TOTP code → into account
 *   7. Logout, log in with a backup code → into account
 *   8. Logout, attempt SAME backup code → rejected (single-use)
 *
 * `test.use({ storageState })` resets to an empty cookie jar so the
 * suite-wide admin login from global-setup doesn't leak in.
 */

test.use({ storageState: { cookies: [], origins: [] } });

// Page-level `.first()` because the footer also has a newsletter email
// input matching the same selector. The login form is always the first
// match.
function emailInput(page: Page) {
  return page.locator('input[type="email"][autocomplete="email"]').first();
}
function passwordInput(page: Page) {
  return page.locator('input[type="password"][autocomplete="current-password"]').first();
}
function codeInput(page: Page) {
  return page.locator('input[autocomplete="one-time-code"]').first();
}

// Sleep until the clock crosses into the next 30-second TOTP step,
// plus a small buffer. Needed when reusing a TOTP code after the
// backend has already accepted one within the same window.
async function waitForNextTotpWindow() {
  const nowSec = Date.now() / 1000;
  const intoStep = nowSec % 30;
  const waitSec = 30 - intoStep + 1;
  await new Promise((r) => setTimeout(r, waitSec * 1000));
}

test("full 2FA lifecycle: setup, login, backup codes, single-use", async ({ page, context }) => {
  // Bigger timeout — this test walks the entire MFA story including
  // multiple logouts and re-logins.
  test.setTimeout(90_000);

  const random = Math.random().toString(36).slice(2, 10);
  const email = `mfa-${random}-${Date.now()}@tph-tests.local`;
  const password = "MfaTest!2026";

  // Create the customer via API (one register hit, total)
  const apiCtx = await playwrightRequest.newContext();
  const reg = await apiCtx.post(`${API_URL}/auth/register/`, {
    data: { email, password, first_name: "Mfa", last_name: "Test", gdpr_consent: true },
  });
  const regOk = reg.ok();
  const regStatus = reg.status();
  const regBody = regOk ? "" : await reg.text();
  await apiCtx.dispose();
  if (!regOk) throw new Error(`Customer create failed: ${regStatus} ${regBody}`);

  // ----- Step 1: log in (no MFA yet → straight to /account) -----
  await page.goto("/account/login");
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/account$/);

  // ----- Step 2: status page reads OFF -----
  await page.goto("/account/security");
  await expect(page.getByText(/two-factor authentication is off/i)).toBeVisible();

  // ----- Step 3: walk the wizard -----
  await page.getByRole("button", { name: /enable two-factor/i }).click();
  await expect(page).toHaveURL(/\/account\/security\/setup/);

  // Step 1 → 2
  await expect(page.getByRole("heading", { name: /install an authenticator/i })).toBeVisible();
  await page.getByRole("button", { name: /i've installed an app/i }).click();

  // Step 2 → 3
  await expect(page.getByRole("heading", { name: /open the app and tap/i })).toBeVisible();
  await page.getByRole("button", { name: /ready to scan/i }).click();

  // Step 3: scrape the secret
  await expect(page.getByRole("heading", { name: /scan this qr code/i })).toBeVisible();
  const secretLoc = page.locator("code").first();
  await expect(secretLoc).toBeVisible({ timeout: 5000 });
  const secret = (await secretLoc.innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  // Step 3 → 4
  await page.getByRole("button", { name: /i've added the account/i }).click();

  // Step 4: enter TOTP
  await expect(page.getByRole("heading", { name: /enter the 6-digit code/i })).toBeVisible();
  await codeInput(page).fill(generateSync({ secret }));
  await page.getByRole("button", { name: /verify and enable/i }).click();

  // Step 5: backup codes visible
  await expect(page.getByRole("heading", { name: /save your backup codes/i })).toBeVisible({ timeout: 10_000 });
  const allCodes = await page.locator("code").allInnerTexts();
  const backupCodes = allCodes
    .map((c) => c.trim())
    .filter((c) => /^[A-Z2-9]{8}$/.test(c));
  expect(backupCodes.length).toBe(10);
  const firstBackup = backupCodes[0];
  const secondBackup = backupCodes[1];

  // Finish → back to status
  await page.getByRole("button", { name: /^done$/i }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByText(/two-factor authentication is on/i)).toBeVisible();

  // ----- Step 4: logout, log back in with a TOTP code -----
  //
  // Replay defence: the code used in setup advances last_used_counter
  // to the current 30-second step. Re-generating a code within the
  // same window produces the same digits → rejected. Wait until the
  // clock crosses into the next step.
  await waitForNextTotpWindow();

  await context.clearCookies();
  await page.goto("/account/login");
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: /enter your 6-digit code/i })).toBeVisible({ timeout: 5000 });

  await codeInput(page).fill(generateSync({ secret }));
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);

  // ----- Step 5: logout, log in with backup code -----
  await context.clearCookies();
  await page.goto("/account/login");
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: /enter your 6-digit code/i })).toBeVisible();
  await codeInput(page).fill(firstBackup);
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);

  // ----- Step 6: SAME backup code must now fail (single-use) -----
  await context.clearCookies();
  await page.goto("/account/login");
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: /enter your 6-digit code/i })).toBeVisible();
  await codeInput(page).fill(firstBackup);
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page.getByText(/that code didn't work/i)).toBeVisible({ timeout: 5000 });
  // Still on the code step — never reached /account
  await expect(page).not.toHaveURL(/\/account$/);

  // ----- Step 7: a DIFFERENT backup code still works -----
  await codeInput(page).fill(secondBackup);
  await page.getByRole("button", { name: /^verify$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
});
