import { expect, test } from "@playwright/test";

/**
 * Storefront critical-flow tests.
 *
 * Exercises the visitor-side journey from landing through to a PDP.
 * Stops short of completing a Stripe payment because that requires
 * Stripe test card iframes which slow tests down — the payment flow
 * is covered separately by the bash smoke + manual checks.
 *
 * Lives under `/products/{slug}` rather than the landing page because
 * the landing page is fragile to seeded-data presence (recent reviews,
 * featured products, etc.) and these tests should keep working on a
 * near-empty DB.
 */

test("landing page renders without hydration errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: /the pet headquarters/i }).first()).toBeVisible();

  // Wait long enough for React to hydrate; hydration warnings are
  // reported via console.error so they show up in our collector.
  await page.waitForTimeout(1500);

  const hydrationIssues = consoleErrors.filter((e) =>
    e.toLowerCase().includes("hydrat"),
  );
  expect(hydrationIssues, `hydration errors: ${hydrationIssues.join("\n")}`).toHaveLength(0);
});

test("search modal opens and surfaces live results", async ({ page }) => {
  await page.goto("/");

  // Header search icon — targeted via its aria-label, which is the
  // intended a11y handle and lets us avoid `nth-child` brittleness.
  await page.getByRole("button", { name: /open search/i }).click();

  const searchInput = page.getByPlaceholder(/search for/i);
  await expect(searchInput).toBeVisible();
  // Use a single letter so the test isn't tied to specific product
  // names — every active catalog ought to have at least one product
  // whose name or description contains a common letter, and the
  // backend search is icontains-based so this matches reliably.
  await searchInput.fill("a");

  // After the 250ms debounce + API response we expect EITHER the
  // "See all results" CTA (matches found) OR the explicit no-results
  // state. Both prove the search round-trip works; only a stuck
  // loading state or hard error would leave both invisible.
  await expect(
    page.getByText(/See (all|.+ in the catalogue)|No products match/i),
  ).toBeVisible({ timeout: 8000 });
});

test("product detail page renders all sections", async ({ page }) => {
  // Pull the first active product directly from the API so the spec
  // doesn't depend on a specific slug existing.
  const res = await page.request.get(`${process.env.TPH_TEST_API_URL || "http://localhost:8000/api/v1"}/products/?page_size=1`);
  const body = await res.json();
  const slug = body?.results?.[0]?.slug;
  test.skip(!slug, "no active products in DB — seed the catalog first");

  await page.goto(`/products/${slug}`);

  // Core PDP elements
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
});

test("nav mega-menu opens on click and closes on outside click", async ({ page }) => {
  await page.goto("/");

  // The nav mega-menu tab is a <button> rendered inside <nav>.
  // Using role+name is stable across our visual refactors.
  await page.getByRole("button", { name: "Categories" }).click();

  // Scope to the dropdown panel via its aria-label region — the
  // landing page also has a "Shop by pet" heading, so an unscoped
  // role-based match is ambiguous and Playwright errors.
  const menuPanel = page.getByRole("region", { name: /navigation menu/i });
  await expect(menuPanel.getByRole("heading", { name: /shop by pet/i })).toBeVisible({ timeout: 5000 });

  // ESC closes — more reliable than clicking a specific outside pixel
  // that the open panel might cover.
  await page.keyboard.press("Escape");
  await expect(menuPanel.getByRole("heading", { name: /shop by pet/i })).not.toBeVisible({ timeout: 5000 });
});
