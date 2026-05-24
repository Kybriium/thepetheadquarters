import { defineConfig, devices } from "@playwright/test";

/**
 * Critical-flow Playwright config for The Pet Headquarters.
 *
 * Targeted at the handful of user journeys that actually break in real
 * browsers — image uploads, multipart forms, multi-step modal flows —
 * not as a substitute for the cheaper API-level `scripts/smoke.sh`.
 * Run both before reporting any feature complete.
 *
 * Run with:
 *     # one-off:
 *     cd website
 *     export TPH_TEST_ADMIN_EMAIL="..."
 *     export TPH_TEST_ADMIN_PASSWORD="..."
 *     npx playwright test
 *
 *     # interactive UI mode (handy while developing tests):
 *     npx playwright test --ui
 *
 * Tests assume:
 *   - Backend running at http://localhost:8000 (override via TPH_TEST_API_URL)
 *   - Frontend running at http://localhost:3000 (override via TPH_TEST_FE_URL)
 *   - An admin user exists with the credentials above
 */

const FE_URL = process.env.TPH_TEST_FE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  // Serial execution because several tests mutate shared admin state
  // (uploads, expenses, supplier links) — parallel runs would race.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: FE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Cookies are baked in by global-setup once at the start of the
    // suite so each spec inherits an authenticated session — avoids
    // tripping the login throttle when several admin specs run in a
    // row. Public-only specs (storefront) are unaffected by the
    // presence of the cookies.
    storageState: "./tests/.auth/admin-storage.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
