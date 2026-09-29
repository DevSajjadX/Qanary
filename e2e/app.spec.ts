/**
 * e2e specs for Qanary — Playwright drives the Vite dev server (port 1420)
 * with the Tauri IPC bridge mocked via @tauri-apps/api/mocks.
 *
 * Scenarios:
 *   1. Initial seeded snapshot renders correct status (green → "All clear")
 *   2. Refresh button → `refresh_now` invoked
 *   3. Add-list modal → `add_list` invoked with parsed args
 *   4. Settings modal → `update_settings` invoked after changing a field
 *   5. Settings Config card → Export / Import buttons
 *   6. List reorder survives a `service-update` delta
 */
import { test, expect } from "./fixtures";

test("1 — initial snapshot renders green status", async ({ mockedPage: page }) => {
  // Hero should show the "all clear" headline for overall=green
  await expect(page.locator(".hero-headline")).toContainText("All clear");
  // The seeded list name should be visible
  await expect(page.getByText("Internet")).toBeVisible();
});

test("2 — refresh button triggers refresh_now command", async ({
  mockedPage: page,
  getInvokedCmds,
}) => {
  // The refresh button is the status-light button (aria-label="Refresh")
  const refreshBtn = page.getByRole("button", { name: /refresh/i });
  await refreshBtn.click();

  // After click, refresh_now should appear in the invoked commands
  await expect.poll(() => getInvokedCmds()).toContain("refresh_now");

  // Hero should still show green (mock returns the same snapshot)
  await expect(page.locator(".hero-headline")).toContainText("All clear");
});

test("3 — add-list modal submits add_list command", async ({
  mockedPage: page,
  getInvokedCmds,
}) => {
  // Open the menu dropdown
  await page.getByRole("button", { name: /menu/i }).click();
  // Click "Add list"
  await page.getByRole("button", { name: /add list/i }).click();

  // Fill in the list name modal
  const nameInput = page.getByPlaceholder(/list name/i);
  await nameInput.fill("Test List");

  // Submit the modal
  const saveBtn = page.getByRole("button", { name: /add|save|create/i }).last();
  await saveBtn.click();

  // Verify add_list was called
  await expect.poll(() => getInvokedCmds()).toContain("add_list");
});

test("4 — settings modal opens and update_settings is invoked", async ({
  mockedPage: page,
  getInvokedCmds,
}) => {
  // Open menu → Settings
  await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("button", { name: /^settings$/i }).click();

  // Settings panel should be visible
  await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

  // Find and click a "Save" or "Apply" button
  const saveBtn = page.getByRole("button", { name: /save|apply/i }).last();
  await saveBtn.click();

  // Verify update_settings was called
  await expect.poll(() => getInvokedCmds()).toContain("update_settings");
});

test("5 — settings panel shows Config card with Export and Import buttons", async ({
  mockedPage: page,
}) => {
  // Open menu → Settings
  await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("button", { name: /^settings$/i }).click();

  // Config card legend and both action buttons must be present
  await expect(page.getByText("Config", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /import/i })).toBeVisible();
});

// R3: a reorder painted without moving the delta merge base was reverted by the next
// per-service update (the backend's probe results keep arriving while you drag).
test("6 — a list reorder survives the next service-update", async ({
  mockedPage: page,
  getInvokedCmds,
  emitEvent,
}) => {
  const names = page.locator(".list-name-text");
  await expect(names).toHaveText(["Internet", "Intranet"]);

  await page.getByTitle("List options").first().click();
  await page.getByRole("button", { name: "Edit order" }).click();

  const grip = page.locator(".list-grip-btn");
  const from = (await grip.nth(1).boundingBox())!;
  const to = (await grip.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y - 10, { steps: 12 });
  await page.mouse.up();
  await expect(names).toHaveText(["Intranet", "Internet"]);
  await expect.poll(() => getInvokedCmds()).toContain("reorder_lists");

  await emitEvent("service-update", {
    list_id: "internet",
    service: {
      id: "s1",
      label: "Google",
      state: "up",
      endpoints: [{ id: "e1", host: "google.com", state: "up", latency_ms: 25 }],
    },
    list_all_down: false,
    overall: "green",
    cut_off: false,
    settled: true,
  });
  await expect(page.getByText("25 ms")).toBeVisible();
  await expect(names).toHaveText(["Intranet", "Internet"]);

  await page.getByRole("button", { name: /^done$/i }).click();
  await expect(names).toHaveText(["Intranet", "Internet"]);
});
