# 0034. The menu-bar icon has four selectable looks and an Offline state (first backend change in the Glass PR)

- **Status:** accepted
- **Date:** 2026-10-01
- **Deciders:** Sajjad (DevSajjadX)

## Context

ADR-0032 redesigned the UI frontend-only and deliberately left the tray (menu-bar) icon alone:
it is drawn pixel by pixel in Rust (`src-tauri/src/tray.rs`, ADR-0008) and kept the pre-Glass
colors. Two things were asked for after that: the same Rings / Pulse choice for the menu-bar icon
that ADR-0033 gave the in-app status icon, and a filled-plate variant of each. The tray icon also
had no way to say **Offline** — Rust only handed it a three-valued `Severity` — so the new
crimson Offline state of the hero had no counterpart.

Only the backend can change that icon, so this is the one place the redesign touches Rust.

## Decision

- **Four looks** — `TrayStyle`: `rings`, `pulse`, `rings-filled`, `pulse-filled`.
  *Rings* are the in-app rings, bare on the menu bar. *Pulse* is the heartbeat inside a
  rounded-square outline. The *filled* looks cut the same picture out of a colored rounded square.
- **Stored in the config** as `tray_style` (default `rings`). It is additive with a serde default,
  so older configs load as `rings` and there is no schema migration (like `notify_volume`). It is
  a *config* setting, not a per-device one like ADR-0033's, because the backend needs to read it.
  It travels with Export / Import and resets with Reset to defaults.
- **Applied live.** `update_settings` / import / reset call `tray::set_style`; the tray remembers
  its last settled state, so a style change redraws at once instead of waiting for a probe. The
  breathing "checking" frames follow the chosen look.
- **Offline.** The scheduler passes `cut_off` along with the severity (it was already in every
  delta and snapshot). Cut-off wins over severity, as in the hero: crimson `#b8123f`, struck
  through (Pulse: a flat dashed line, no X — the X is Alarm's).
- **Palette.** The icons use the Glass `--state-*` values, retiring the old tray colors.
- **Drawing.** Simple shapes (rings, polylines, dots, a rounded-square frame/plate) in the same
  24-unit box as the in-app SVGs, supersampled 4× at **44 px**. macOS draws a tray icon 18 pt tall
  whatever its pixel size, so this is sharp on Retina. No image assets.
- **Settings.** *System → Menu bar icon*: four cards, each showing the look in all five states
  (all clear, heads up, alarm, offline, checking). It is part of the form's **Save**.
  `src/components/trayIcons.tsx` redraws the shapes as SVG for the picker.

## Alternatives considered

- **Drive the tray icon from the frontend.** The JS tray API can set an icon, but the Rust side
  repaints it on every probe result, so the two would fight. Rust has to own it.
- **A per-device `localStorage` setting like the in-app one.** The backend cannot read it.
- **One style plus a "Filled" switch.** Fewer cards, but a switch hides what the result looks
  like; the user asked for the four looks to be shown side by side with all their states.
- **Bundled PNG assets per look/state.** 4 looks × 5 states of retina art to keep in sync with
  the palette; runtime drawing already existed and follows the tokens.
- **Keep the PR frontend-only and ship this separately.** The maintainer agreed to the redesign;
  the tray is part of how the redesign looks, and the PR had not been opened yet. Flagged in the
  PR description as the one backend change.

## Consequences

## **Positive:**

- The menu bar matches the app: same palette, same two pictures, an Offline state.
- A fresh look is one entry in `prims` / `filled_prims` (Rust) and `bare` / `cutOut` (TS).

## **Negative / accepted trade-offs:**

- **The geometry exists twice** (Rust pixels, TS SVG for the picker). Both carry a comment
  pointing at the other; the Rust tests pin the shapes, the TS tests pin the states.
- Crimson Offline is low-contrast on a dark menu bar (fine on a light one and on the filled looks).
- Rust and `config.json` now know about a visual setting.
- The icons are drawn for macOS. Windows/Linux tray rendering of the 44 px image is unverified.

## **Follow-ups:**

- Check the tray on Windows/Linux when those targets ship.
- A distinct tray state for "update ready" if it is ever wanted.
