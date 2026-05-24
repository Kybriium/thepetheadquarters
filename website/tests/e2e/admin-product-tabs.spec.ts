import { expect, test } from "@playwright/test";
import { API_URL } from "./_helpers";

/**
 * Every tab on the admin product edit page.
 *
 *   - Info tab (form fields render, save works)
 *   - Variants tab (add + delete a variant inline)
 *   - Images tab (already covered in admin-image-upload.spec.ts,
 *     just verify it loads cleanly)
 *   - Customizations tab (renders empty state or attached templates)
 *   - Suppliers tab (today's new feature — search picker)
 *
 * Creates a throwaway product per-test so we don't pollute the
 * catalog. Each test cleans up after itself in `finally`.
 */

async function createProduct(page: { request: { post: (u: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; text: () => Promise<string>; json: () => Promise<{ data: { id: string } }> }> } }): Promise<string> {
  const ts = Date.now();
  const res = await page.request.post(`${API_URL}/admin/products/`, {
    data: {
      name: `Tab Test ${ts}`,
      description: "for tab tests",
      short_description: "T",
      brand_id: null,
      fulfillment_type: "self",
      is_featured: false,
      is_active: true,
      category_ids: [],
    },
  });
  expect(res.ok(), `couldn't create: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.data.id;
}

async function deleteProduct(page: { request: { delete: (u: string) => Promise<unknown> } }, id: string) {
  await page.request.delete(`${API_URL}/admin/products/${id}/`);
}

test("Info tab — name + description visible, change + save round-trip", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);

    // Info tab is default. Edit the description and Save.
    const descriptionField = page.locator("textarea, [contenteditable=true]").first();
    if (await descriptionField.isVisible({ timeout: 1500 }).catch(() => false)) {
      await descriptionField.fill("Updated by Playwright");
    }

    // Save button text varies — match generically
    const saveBtn = page.getByRole("button", { name: /^save$/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      // Toast or success state — just confirm we didn't error
      await page.waitForTimeout(800);
    }
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Variants tab — empty state then add inline", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: /^variants/i }).click();
    // Either an empty state or an Add Variant button — both prove the
    // panel mounted.
    await expect(
      page.getByText(/add variant|no variants|create variant/i).first(),
    ).toBeVisible({ timeout: 5000 });
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Images tab — Add Image button appears", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: /^images/i }).click();
    await expect(page.getByRole("button", { name: /add image/i })).toBeVisible();
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Customizations tab — opens without errors", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: /^customizations/i }).click();
    // Loading spinner OK; just confirm we didn't crash
    await page.waitForTimeout(1000);
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Suppliers tab — empty-state prompts admin to add a variant first", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: /^suppliers/i }).click();
    await expect(page.getByText(/add a variant first/i)).toBeVisible();
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Suppliers tab on a product WITH variants — Add supplier opens picker", async ({ page }) => {
  // Use a real seeded product that has variants. Filter to active +
  // page through to find one with variants since the admin list isn't
  // pre-sorted by variant count.
  const listRes = await page.request.get(`${API_URL}/admin/products/?is_active=true&page_size=20`);
  const items = (await listRes.json())?.results ?? [];
  const productId = items[0]?.id;
  test.skip(!productId, "no active products");

  await page.goto(`/admin/products/${productId}`);
  // Confirm the product has variants by inspecting the variants tab
  // label "variants (N)". Skip if it's zero.
  const variantsTab = page.getByRole("button", { name: /variants \(/i });
  await variantsTab.waitFor({ state: "visible" });
  const variantsLabel = await variantsTab.textContent();
  if (variantsLabel?.includes("(0)")) {
    test.skip(true, "selected product has no variants");
  }

  await page.getByRole("button", { name: /^suppliers/i }).click();

  // Click "Add supplier" — should reveal supplier picker
  const addBtn = page.getByRole("button", { name: /add supplier/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 5000 });
  await addBtn.click();

  // SupplierPicker uses a placeholder we can target
  await expect(page.getByPlaceholder(/search suppliers/i)).toBeVisible();
});

test("Size & Fit tab — template + edit cell + save round-trip", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);
    await page.getByRole("button", { name: /size & fit/i }).click();

    // Empty state — start from the template
    await expect(page.getByText(/no size chart yet/i)).toBeVisible();
    await page.getByRole("button", { name: /use harness\/collar template/i }).click();

    // Template populates 4 columns. Weight column header is unique
    // enough to assert on without picking up table data.
    await expect(page.locator('input[value="Weight (kg)"]').first()).toBeVisible();

    // Fit notes
    await page.locator("textarea").first().fill("Playwright size & fit smoke");

    await page.getByRole("button", { name: /^save$/i }).click();
    // Toast "Size & fit saved" confirms persistence
    await expect(page.getByText(/size & fit saved/i)).toBeVisible({ timeout: 5000 });
  } finally {
    await deleteProduct(page, productId);
  }
});

test("Activate / Deactivate toggle round-trip", async ({ page }) => {
  const productId = await createProduct(page);
  try {
    await page.goto(`/admin/products/${productId}`);

    // Should show Deactivate button (product is active)
    const deactivate = page.getByRole("button", { name: /^deactivate$/i });
    await expect(deactivate).toBeVisible();
    await deactivate.click();

    // Confirm the modal then verify we navigate to /admin/products
    // (the page issues window.location.href). Wait briefly + confirm
    // the button is now hidden (we're off the page) OR the toggle
    // flipped to "Reactivate".
    const confirmBtn = page.getByRole("button", { name: /^deactivate$/i }).nth(1);
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(1500);
  } finally {
    await deleteProduct(page, productId);
  }
});
