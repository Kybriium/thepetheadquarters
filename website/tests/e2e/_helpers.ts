import type { Page } from "@playwright/test";

/**
 * Test helpers shared across e2e specs.
 *
 * `loginAsAdmin` POSTs the login form directly through the JSON API,
 * which sets the httpOnly auth cookies on the browser context. After
 * this returns the page can navigate to any admin route as the
 * authenticated user without going through the visual login screen
 * (which is exercised by its own dedicated spec).
 *
 * Reading credentials from env so the same tests run locally and in
 * CI without having to commit them.
 */

export const API_URL = process.env.TPH_TEST_API_URL || "http://localhost:8000/api/v1";
export const FE_URL = process.env.TPH_TEST_FE_URL || "http://localhost:3000";

/**
 * No-op kept for API stability. Auth cookies are loaded once at the
 * start of the suite via `playwright.config.ts > storageState`
 * (populated by `global-setup.ts`). Per-test login calls were tripping
 * the LoginThrottle when several admin specs ran back-to-back, so we
 * removed them — leaving the function in place so existing specs
 * that call `await loginAsAdmin(page)` don't have to be rewritten.
 */
export async function loginAsAdmin(_page: Page): Promise<void> {
  return;
}

/**
 * Tiny 4×4 PNG generator — used by upload tests so they don't depend
 * on a binary on disk. Returns a Buffer Playwright accepts directly
 * for `setInputFiles({ name, mimeType, buffer })`.
 *
 * Pillow runs verify() on uploads and rejects anything that doesn't
 * round-trip cleanly. The byte sequence below was emitted by:
 *
 *   from PIL import Image, io
 *   buf = io.BytesIO()
 *   Image.new("RGB", (4, 4), (255, 0, 0)).save(buf, "PNG")
 *   import base64; print(base64.b64encode(buf.getvalue()).decode())
 *
 * Don't hand-edit this string — regenerate it from Pillow if you need
 * a different size / colour, or the upload tests will fail with
 * `upload.invalid_image`.
 */
export function tinyPngBuffer(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR4nGP8z4AATEhsPBwA" +
    "M9EBBzDn4UwAAAAASUVORK5CYII=",
    "base64",
  );
}
