# 0042. A dev-only mock backend, shared with e2e

- **Status:** accepted
- **Date:** 2026-10-02
- **Deciders:** Esi-Abolfazl

## Context

The frontend can only fetch data through the Tauri IPC bridge, so `pnpm dev` in a browser showed
an empty app. Visual checks needed the native window, which can't be driven by automation on macOS.
The e2e suite carried its own inline `__TAURI_INTERNALS__` shim inside its fixtures.

## Decision

- `src/dev/mockTauri.ts` fakes `window.__TAURI_INTERNALS__` with canned lists covering every state.
  `main.tsx` loads it only when `import.meta.env.DEV` and the URL has `?mock`, and waits for it
  before rendering; a release build drops the branch (checked: no mock strings in `dist`).
- Scenarios: `?mock` (a Critical and a normal list fully down), `?mock=down` (Iran down too),
  `?mock=critical` (Global down too).
- e2e fixtures set `window.__MOCK__ = { snap, cfg }` and open `/?mock`: one shim, two users.

## Alternatives considered

- **`@tauri-apps/api/mocks`** — needs wiring inside the page anyway, and the old fixture already
  hit ESM scoping trouble loading it through `addInitScript`.
- **Keep the e2e-only shim** — the browser preview would still have no data, and two shims drift.
- **Keep the mock local, uncommitted** — lost on the next stash, checkout or merge.

## Consequences

**Positive:** UI checks in a plain browser at any width and theme; e2e and manual checks see the
same backend contract.

**Negative / accepted trade-offs:** the mock answers every write with the canned config and never
pushes events by itself; flows that need a live backend still need `pnpm tauri dev`.

**Follow-ups:** none.
