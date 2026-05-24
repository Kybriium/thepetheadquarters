import { chromium, type FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * One-shot login at suite startup so individual specs don't each hit
 * the /auth/login/ throttle (which fires after a handful of attempts
 * inside a minute and was making the whole admin suite flaky).
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

const STORAGE_PATH = path.resolve(__dirname, "../.auth/admin-storage.json");
const API_URL = process.env.TPH_TEST_API_URL || "http://localhost:8000/api/v1";

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.TPH_TEST_ADMIN_EMAIL;
  const password = process.env.TPH_TEST_ADMIN_PASSWORD;

  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

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
  const res = await context.request.post(`${API_URL}/auth/login/`, {
    data: { email, password },
  });
  if (!res.ok()) {
    await browser.close();
    throw new Error(`Global login failed: ${res.status()} ${await res.text()}`);
  }
  await context.storageState({ path: STORAGE_PATH });
  await browser.close();
  console.log(`[globalSetup] Auth cookies saved to ${STORAGE_PATH}`);
}
