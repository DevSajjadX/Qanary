# 0044. One status-icon setting for the orb and the menu bar

- **Status:** accepted (supersedes ADR-0033's per-device `localStorage` choice and ADR-0034's four-look setting)
- **Date:** 2026-10-03
- **Deciders:** Esi-Abolfazl

## Context

The Glass PR added two pickers for the same picture. **Settings → Appearance → Status icon**
(Rings | Pulse, ADR-0033) set the in-app orb, saved per device in `localStorage`. **Settings →
System → Menu bar icon** (four looks, ADR-0034) set the tray, saved in the config. You could
pick Rings in the app and Pulse in the menu bar. The two big tile grids also took a lot of space
for two small choices. The owner asked for one compact picker: the icon in one row, and the
menu bar's outline or filled look in another.

## Decision

- One choice, `status_icon` (`"rings" | "pulse"`), sets both the orb and the menu-bar icon. A
  second choice, `tray_filled` (bool), applies to the menu bar only: the icon drawn bare
  (Outline) or cut out of a filled rounded square (Filled). Default: Pulse, Filled (also for
  configs saved before these settings existed).
- Both settings live in the config (`models.rs`), because the backend draws the tray. The old
  `tray_style` key and the `qanary-orb-style` `localStorage` key are gone. Both shipped only in
  this unreleased PR, so nothing is migrated.
- The picker is two segmented rows in **Settings → Appearance**: *Status icon* (Rings | Pulse,
  each with a small live orb) and *Menu bar* (Outline | Filled, each showing the chosen icon).
  The System card no longer has an icon picker.
- The icon applies on **Save**, like the rest of the form, and Cancel discards it. Theme, in the
  same card, still applies at once: it is per device and has no backend.
- The tray keeps its four drawings. `tray::TrayStyle::of(icon, filled)` maps the two settings onto
  them, so `tray.rs` draws exactly what it drew before.

## Alternatives considered

- **Keep two independent pickers, just smaller.** Still allows an orb and a menu bar that
  disagree, which the owner did not want.
- **Keep the orb choice in `localStorage` and copy it to the config.** Two stores for one
  setting, and they can drift.
- **Apply the icon immediately, as Theme does.** Saving at once re-seeds the Settings form from
  the new config and would wipe other edits still pending in it.

## Consequences

## **Positive:**

- One setting for one picture: the orb and the menu bar always match.
- The Appearance card gets two short rows instead of two tile grids.

## **Negative / accepted trade-offs:**

- The orb no longer switches the moment you click. You see it after Save.
- The orb's style is now one per config, no longer one per device. Export/import carries it.
- The picker shows only the all-clear picture. Previously every state was shown for each look.

## **Follow-ups:**

- None new. The tray geometry parity check from ADR-0043 still stands (TODO.md).
