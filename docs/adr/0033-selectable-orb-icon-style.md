# 0033. The status orb has two selectable icon styles: Rings and Pulse

- **Status:** accepted; offline icon superseded by ADR-0043; the per-device `localStorage` choice superseded by ADR-0044 (one config setting for the orb and the menu bar)
- **Date:** 2026-10-01
- **Deciders:** Sajjad (DevSajjadX)

## Context

ADR-0032 gave the hero a status orb whose icon is a set of concentric rings. While designing it,
five icon directions were weighed (Wi‑Fi, signal bars, globe, **pulse**, broadcast). Rings won,
but **Pulse** — a canary heartbeat — fits the "canary = health signal" identity better and some
people will simply prefer it. Both are cheap, and both can be driven by the same `Mood`.

## Decision

- Add a second icon style, **Pulse**: an ECG line that fades out at both ends, with a soft light
  running along the wave (see the note at the end for how it moves).
  Calm = a clean beat; warn = a shallower, faster beat; alarm = a dead dashed line marked with an
  X; offline = the same line struck through (no X); busy = the calm trace with a fast sweep; idle
  = a quiet flat line. (The alarm and offline *motion* was revised in
  [ADR-0038](0038-orb-motion-in-every-state.md): alarm is now a 20 s failing-heartbeat story and
  offline's dashes drift while the slash blinks.)
- The user picks the style in **Settings → Appearance → Status icon** (Rings | Pulse), with a
  live animated sample on each option. It applies immediately; no Save.
- It is a per-device preference stored in `localStorage` (`qanary-orb-style`), like the theme —
  no backend, no config schema change. Because the hero and Settings both need it, it lives in a
  tiny external store, `src/orbStyle.ts` (`useSyncExternalStore`), not in either component.
- The icon definitions moved out of `StatusHero` into `src/components/orbIcons.tsx`
  (`ORB_ICON[style][mood]`, `OrbIcon`, `OrbThumb`) so the hero and the Settings picker share them.
  Color, glow, pop/ripple/shake on a mood change, hover-to-refresh and the busy gray are the same
  for both styles; only the icon and its own motion differ.
- `prefers-reduced-motion` hides the sweep and stops the other motion (the trace stays visible).

## Alternatives considered

- **Replace Rings with Pulse.** Rings were chosen first and tested; removing them would change a
  look that is already reviewed. A choice costs one small component.
- **Store the choice in the backend config.** Would add a field, a migration and a Rust change for
  a purely visual, per-device preference. Same reasoning as the theme.
- **A CSS `data-` attribute on `<html>` (like the theme).** The two styles are different SVG, not
  different colors, so React has to render them; an external store keeps both components in sync.

## Consequences

## **Positive:**

- Users can match the app to their taste; the heartbeat reads as "the canary is alive" at a glance.
- Adding a third style later is one entry in `ORB_ICON` plus its CSS.

## **Negative / accepted trade-offs:**

- The choice doesn't follow the user to another machine or survive clearing site data (same as the theme).
- The tray icon is unaffected: it is drawn in Rust.

## **Follow-ups:**

- A third style (Wi‑Fi / globe) if people ask for it.

## Note: how the Pulse light moves (revised after review)

The first version was a dim trace with a dashed bright segment. It read as a plain line, then as
separate pieces when layered. The shipped version is one gradient line plus a light made of a few
radial-gradient dots moved along the beat's own path with `<animateMotion>`: steady along the flat
stretches, about 1.7× faster through the beat, sliding in from beyond the left end and out past the
right one, then resting *off the line* so nothing sits stuck on the end. The tail is the same
motion started a few hundredths of a second later. Reduced motion keeps the line and drops the
light.
