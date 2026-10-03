# 0032. Glass UI redesign: frontend-only, orb-as-refresh, one mood color

- **Status:** accepted; Critical badge and boxed row labels superseded by ADR-0040; orb colors amended by ADR-0043
- **Date:** 2026-10-01
- **Deciders:** Sajjad (DevSajjadX) — agreed with Esi-Abolfazl outside GitHub before the PR

## Context

The window looked like a utility panel: a left-aligned header, dots as the only status signal, a
hamburger menu holding five unrelated actions, and a red banner repeating what the rows already
said. The goal was a calmer, more modern look and a layout that makes the overall status the
first thing you see, in the 460×720 window (min 400×500) the app actually opens at.

Constraint: **no backend change.** Everything the new look needs is already in `Snapshot`
(`overall`, `cut_off`, `all_down`, `critical`, per-endpoint `state`/`latency_ms`). A design that
needed new Rust (per-list severity rollup, window vibrancy) was reshaped or dropped rather than
smuggled in.

The design was prototyped as a self-contained page, [`docs/design/glass-preview.html`](../design/glass-preview.html),
and reviewed there before any app code changed.

## Decision

**Look.** "Glass": a translucent surface over a status-tinted glow. Tokens in `tokens.css` gain
glass layers (`--glass`, `--glass-strong`, `--glass-card`, `--stroke`, `--chip-*`, `--down-ink`)
and a deeper `--state-offline`; existing token names keep working. Light and dark both come from
`light-dark()` as before.

**One mood drives the hero.** `StatusHero` derives a single `Mood` (`ok | warn | alarm | offline |
busy | idle`) from the snapshot. It sets `--sev` on the hero; the logo's eye, the orb and a soft
glow behind the orb all read it. `--sev` is a registered `<color>` property, so a mood change
cross-fades. The glow is a child of the orb wrapper, not a page background, so it follows the orb
at any window size and fades out about 230px away — never past the middle of the first list.

**The orb is the refresh button.** Concentric rings carry the mood (3 solid = all clear; 2 faded +
"!" = heads up; 3 dashed = alarm; the same + a slash = offline). Hover swaps the rings for a
refresh arrow. While probes are in flight it goes gray and pulses. The headline copy
(`severityCopy`) is unchanged.

**Layout.** Logo and settings gear on top. Headline, subtitle and the IP chip (+ update button)
stack on the left; the orb sits on the right, centred on that block and in line with the lists'
⋯ column. The update button is Update → Downloading… → Restart; "ready" reuses the Critical pulse.

**Menu removed.** The hamburger is gone. *Add list* and *Edit order* are buttons under the lists
(Edit order is also still in each list's ⋯ menu). *Theme* and *Reset to defaults* moved into
Settings with unchanged behavior. Settings stays a modal.

**Lists and rows.**
- The list name sits in a fixed gray chip — the same for every list, whatever its status.
- A **Critical** badge (new; Critical used to be visible only in the edit dialog) sits before the
  count and turns solid red and pulses while that list is down.
- The `n/m` count is replaced by **All unreachable** (**All down** on narrow windows) when
  `all_down` — for any list, critical or not. This replaces the old full-width banner.
- A row is a favicon tile (first letter until/unless the icon loads) with the status dot on its
  corner, the name with the muted host beside it, latency, and a boxed **Blocked** / **Down**.
  Multi-endpoint rows show `7 ● · 4 ●` and expand on a click anywhere on the row.
- Collapsing a list and expanding endpoints animate (`useCollapsible` keeps the body mounted just
  long enough). The chevron does one calm rotation — no spring, no nudge.
- Cut-off keeps ADR-0024's rule (everything non-up reads red) and additionally mutes the lists.

**Unchanged on purpose:** the original Settings volume slider (judged better than the thin custom
one in the prototype); all copy; all component props except `StatusHero` (loses `onAddList`,
`onEditOrder`, `onResetConfig`) and `Settings` (gains `onResetConfig`).

## Alternatives considered

- **Native window vibrancy.** The real "glass". Needs `transparent` window config and a macOS
  private-API feature in Rust — a backend change. The blur here is CSS only.
- **A colored frame around the list name showing the list's severity.** Needs a per-list severity
  rollup the snapshot doesn't carry. Replaced by the fixed chip plus the Critical badge and the
  *All unreachable* label, which use data we already have.
- **Keep the hamburger.** It held five unrelated things; four have a more natural home.
- **Settings as a full page.** Would rewrite open/close handling and its tests for no new
  capability. Kept as a modal.
- **Per-endpoint "copy IP" button.** Dropped in review; not needed.
- **Hover auto-scroll for long list names** (in the prototype). Dropped at first, restored later
  (`useHoverScroll`): the name still has an ellipsis and a tooltip, and scrolls to its end on hover.

## Consequences

## **Positive:**

- Overall status reads first and by color, shape and motion — not only by color.
- Fewer places to look: one orb, one gear, actions next to what they act on.
- Non-critical lists that are fully down are now called out (previously only the red banner did).
- No Rust change, no schema change, no new dependency.

## **Negative / accepted trade-offs:**

- Needs a recent WKWebView: `@property` (Safari 16.4+), `color-mix()` (16.2+), `light-dark()`
  (17.5+, already required) and `grid-template-rows` interpolation (16+). Older systems get
  snapped instead of animated colors at worst.
- The collapse animation delays unmounting a closed list's rows by ~320ms; tests wait for it.
- Light mode is a flat gray wall + glow; the prototype's soft color blobs were not ported.
- The tray icon is drawn in Rust and kept the previous palette here; ADR-0034 brought it in line.
- `docs/design-system.md` sketches were redrawn; ADR-0006's palette values for `--state-*` and
  `--brand` are superseded (the reassignment of yellow to the brand is not).

## **Follow-ups:**

- ~~Tray icon colors → new `--state-*` values.~~ Done in ADR-0034.
- Native vibrancy, if a backend change becomes acceptable.
- ~~Hover auto-scroll for long list names~~ (restored); ~~light-mode wall tints~~ (added, [ADR-0037](0037-one-glass-look-shared-surfaces.md)).
