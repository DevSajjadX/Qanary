import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Headless chromium; local-only (no CI)
  // channel "chrome" = the installed Google Chrome, so no Playwright browser download is needed.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  use: {
    baseURL: "http://localhost:1420",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    // Reuse the server if it's already running (dev workflow convenience)
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
