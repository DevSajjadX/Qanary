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
 *   7. A long list name shows an ellipsis, scrolls to its end on hover and eases back
 *   8. The gear, the list chevron and the row ⋮ share one centre line
 *   9. A service being re-checked shows an animated "Pinging…", then its result
 *  10. Long names never push a row past its card: the row buttons stay inside it
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
  // "Add list" sits under the lists
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
  // Gear → Settings
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
  // Gear → Settings
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

/** A snapshot with one list, for the cases where names are long. */
const longSnapshot = (listName: string, serviceLabel: string) => ({
  lists: [
    {
      id: "internet",
      name: listName,
      icon: "🏢",
      collapsed: false,
      critical: true,
      all_down: false,
      services: [
        {
          id: "g",
          label: "Claude",
          state: "up",
          endpoints: [
            { id: "a", host: "claude.ai", state: "up", latency_ms: 30 },
            { id: "b", host: "api.anthropic.com", state: "up", latency_ms: 32 },
          ],
        },
        {
          id: "s2",
          label: serviceLabel,
          state: "blocked",
          endpoints: [{ id: "d", host: "really-long-hostname.example.co.uk", state: "blocked", latency_ms: 55 }],
        },
      ],
    },
  ],
  overall: "green",
  wan: null,
  cut_off: false,
  settled: true,
});
const LONG_LIST = "Corporate intranet and internal services for the Tehran office";
const LONG_SERVICE = "A very long service label that keeps going and going";

test("7 — a long list name shows an ellipsis, scrolls on hover and eases back", async ({
  mockedPage: page,
  emitEvent,
}) => {
  await page.setViewportSize({ width: 400, height: 560 });
  await emitEvent("status-update", longSnapshot(LONG_LIST, "Digikala"));
  const text = page.locator(".list-name-btn").first();
  await expect(text).toContainText("Corporate intranet");
  // Cut off with an ellipsis (not clipped whole) …
  await expect(text).toHaveCSS("text-overflow", "ellipsis");
  const run = text.locator("span");
  // The name is longer than its chip, so it is cut off.
  await expect
    .poll(() => text.evaluate((el) => (el.firstElementChild as HTMLElement).getBoundingClientRect().width > el.clientWidth + 20))
    .toBe(true);
  // How far the text has moved left of its resting place, and how far its end is from the chip's edge.
  const moved = () => run.evaluate((el) => 0 - new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
  const gapAtEnd = () =>
    text.evaluate((el) => el.getBoundingClientRect().right - (el.firstElementChild as HTMLElement).getBoundingClientRect().right);
  expect(await moved()).toBe(0);

  await page.locator(".list-name").first().hover();
  await expect.poll(moved, { timeout: 4000 }).toBeGreaterThan(20);
  await expect(text).toHaveCSS("text-overflow", "clip"); // no ellipsis while it scrolls

  // At the end of the glide the last letter sits at the edge: no empty space after it.
  await expect.poll(async () => Math.abs(await gapAtEnd()), { timeout: 6000 }).toBeLessThan(1.5);

  await page.mouse.move(2, 400); // off the chip
  await expect.poll(moved, { timeout: 2000 }).toBe(0);
  await expect(text).toHaveCSS("text-overflow", "ellipsis");
});

test("8 — the gear, the list chevron and the row menu share one centre line", async ({
  mockedPage: page,
}) => {
  const centreX = (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const b = el.getBoundingClientRect();
      return b.left + b.width / 2;
    });
  for (const width of [460, 400]) {
    await page.setViewportSize({ width, height: 720 });
    const gear = await centreX('button[aria-label="Settings"] svg');
    const chevron = await centreX(".list-chevron-btn svg");
    const rowMenu = await centreX(".row .list-menu-wrap .list-menu-btn svg");
    expect(Math.abs(gear - chevron), `gear vs chevron at ${width}`).toBeLessThan(0.6);
    expect(Math.abs(rowMenu - chevron), `row menu vs chevron at ${width}`).toBeLessThan(0.6);
  }
});

test("9 — a service being re-checked shows Pinging… and then its result", async ({
  mockedPage: page,
  emitEvent,
}) => {
  const delta = (state: "checking" | "up", latency: number | null) => ({
    list_id: "internet",
    service: {
      id: "s1",
      label: "Google",
      state,
      endpoints: [{ id: "e1", host: "google.com", state, latency_ms: latency }],
    },
    list_all_down: false,
    overall: "green",
    cut_off: false,
    settled: state === "up",
  });

  await emitEvent("service-update", delta("checking", null));
  const pinging = page.locator(".row-pinging").first();
  await expect(pinging).toBeVisible();
  await expect(pinging).toContainText("Pinging");
  await expect(pinging.locator(".ping-dots i")).toHaveCount(3);
  // The dots really animate: their opacity changes between two samples.
  const dot = pinging.locator(".ping-dots i").first();
  const samples = new Set<string>();
  for (let i = 0; i < 6; i++) {
    samples.add(await dot.evaluate((el) => getComputedStyle(el).opacity));
    await page.waitForTimeout(200);
  }
  expect(samples.size).toBeGreaterThan(1);

  await emitEvent("service-update", delta("up", 31));
  await expect(page.getByText("31 ms")).toBeVisible();
  await expect(page.locator(".row-pinging")).toHaveCount(0);
});

test("10 — long names never push a row's buttons out of its card", async ({
  mockedPage: page,
  emitEvent,
}) => {
  const right = (sel: string, i = 0) =>
    page.locator(sel).nth(i).evaluate((el) => el.getBoundingClientRect().right);
  for (const width of [460, 400]) {
    await page.setViewportSize({ width, height: 560 });
    await emitEvent("status-update", longSnapshot(LONG_LIST, LONG_SERVICE));
    await expect(page.getByRole("button", { name: LONG_SERVICE })).toBeVisible();
    const card = await right(".list");
    // Every row (a group and a plain service) keeps its ⋮ inside the card…
    for (let i = 0; i < 2; i++) {
      expect(await right(".row .list-menu-wrap", i), `row ${i} ⋮ at ${width}`).toBeLessThanOrEqual(card);
    }
    // …and so does the group's chevron, and the rows themselves are no wider than the card.
    expect(await right(".row-chev"), `chevron at ${width}`).toBeLessThanOrEqual(card);
    expect(await right(".row", 1), `row at ${width}`).toBeLessThanOrEqual(card);
    // Nothing makes the page scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
