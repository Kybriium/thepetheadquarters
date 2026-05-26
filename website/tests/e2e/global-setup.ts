import { chromium, type FullConfig } from "@playwright/test";
import { generateSync } from "otplib";
import fs from "fs";
import path from "path";

/**
 * One-shot login at suite startup so individual specs don't each hit
 * the /auth/login/ throttle (which fires after a handful of attempts
 * inside a minute and was making the whole admin suite flaky).
 *
 * Also handles MFA enrollment for the test admin: since
 * IsStaffWithMfa blocks every admin endpoint unless the staff account
 * has 2FA on, we transparently enrol the test admin once and persist
 * the TOTP secret to disk. Subsequent runs (where MFA is already on)
 * use the saved secret to compute a live code and complete the login.
 *
 * Writes auth cookies to a JSON file consumed via Playwright's
 * `storageState` option in `playwright.config.ts`. Each spec gets the
 * cookies pre-loaded into its context, no login call needed.
 *
 * If credentials aren't set in env, we still write an empty file so
 * specs that only hit the public storefront keep running — the admin
 * specs will fail with a clean "401" error which is much friendlier
 * than the original throttle cascade.
 */

const AUTH_DIR = path.resolve(__dirname, "../.auth");
const STORAGE_PATH = path.join(AUTH_DIR, "admin-storage.json");
const MFA_SECRET_PATH = path.join(AUTH_DIR, "admin-mfa-secret.txt");
const API_URL = process.env.TPH_TEST_API_URL || "http://localhost:8000/api/v1";

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.TPH_TEST_ADMIN_EMAIL;
  const password = process.env.TPH_TEST_ADMIN_PASSWORD;

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (!email || !password) {
    // Write an empty storage file so config.storageState can still
    // point at it without erroring. Admin specs will skip / fail
    // gracefully with their own auth checks.
    fs.writeFileSync(STORAGE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    console.log("[globalSetup] TPH_TEST_ADMIN_EMAIL/PASSWORD not set — wrote empty auth state");
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Step 1: try a plain login. Three outcomes:
  //   a) 200 + user payload          → no MFA, proceed (and enrol below)
  //   b) 200 + requires_2fa          → MFA already on, finish login
  //   c) 401 / anything else         → bail
  const loginRes = await context.request.post(`${API_URL}/auth/login/`, {
    data: { email, password },
  });
  if (!loginRes.ok()) {
    await browser.close();
    throw new Error(`Global login failed: ${loginRes.status()} ${await loginRes.text()}`);
  }
  const loginBody = await loginRes.json();
  const loginData = loginBody?.data ?? {};

  if (loginData.requires_2fa) {
    // Branch (b): MFA is already on. We need the secret to finish.
    if (!fs.existsSync(MFA_SECRET_PATH)) {
      await browser.close();
      throw new Error(
        "Admin account has MFA on but no secret saved at " +
          MFA_SECRET_PATH +
          ". Delete the MFA enrollment server-side and re-run, or restore the secret.",
      );
    }
    const secret = fs.readFileSync(MFA_SECRET_PATH, "utf8").trim();
    const code = generateSync({ secret });
    const completeRes = await context.request.post(`${API_URL}/auth/2fa/login/`, {
      data: { challenge_token: loginData.challenge_token, code },
    });
    if (!completeRes.ok()) {
      await browser.close();
      throw new Error(`MFA login failed: ${completeRes.status()} ${await completeRes.text()}`);
    }
  } else {
    // Branch (a): no MFA yet. Enrol the test admin so admin endpoints
    // are reachable (IsStaffWithMfa would otherwise return 403 on
    // every admin call).
    const setupRes = await context.request.post(`${API_URL}/auth/2fa/setup/`, {
      data: {},
    });
    if (!setupRes.ok()) {
      await browser.close();
      throw new Error(`MFA setup failed: ${setupRes.status()} ${await setupRes.text()}`);
    }
    const setupBody = await setupRes.json();
    const secret = setupBody?.data?.secret;
    if (!secret) {
      await browser.close();
      throw new Error("MFA setup didn't return a secret");
    }
    const code = generateSync({ secret });
    const verifyRes = await context.request.post(`${API_URL}/auth/2fa/setup/verify/`, {
      data: { code },
    });
    if (!verifyRes.ok()) {
      await browser.close();
      throw new Error(`MFA setup verify failed: ${verifyRes.status()} ${await verifyRes.text()}`);
    }
    fs.writeFileSync(MFA_SECRET_PATH, secret);
    console.log(`[globalSetup] Enrolled test admin in 2FA — secret saved to ${MFA_SECRET_PATH}`);
  }

  await context.storageState({ path: STORAGE_PATH });
  await browser.close();
  console.log(`[globalSetup] Auth cookies saved to ${STORAGE_PATH}`);
}
