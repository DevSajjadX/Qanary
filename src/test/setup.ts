import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL auto-cleanup (vitest doesn't inject afterEach the same way jest does)
afterEach(cleanup);

// Node ≥25 ships its own global `localStorage`, which shadows jsdom's and has no methods unless
// Node runs with --localstorage-file. Restore jsdom's (vitest exposes the instance as `jsdom`).
if (typeof globalThis.localStorage?.getItem !== "function") {
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
  Object.defineProperty(globalThis, "localStorage", {
    value: jsdom.window.localStorage,
    configurable: true,
  });
}

// Global mocks for Tauri runtime APIs — not available in jsdom
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn().mockResolvedValue(null),   // simulates user cancelling file picker
  open: vi.fn().mockResolvedValue(null),
}));
