# 0037. One glass look: shared surface variables, 3D beads and buttons

- **Status:** accepted
- **Date:** 2026-10-02
- **Deciders:** Sajjad (DevSajjadX)

## Context

ADR-0032 shipped the Glass look, but each box was styled on its own: list cards, Settings cards,
buttons, the IP chip, pickers, switches and badges each had their own background, border and shadow.
Looking at the real window they did not match: some were flat, some had a lit edge, three kinds of
switch were three slightly different switches. Every round of polish ("make that one 3D too") had to be
repeated in a dozen places, and one forgotten place made the window look inconsistent.

## Decision

- **Surfaces are defined once, as CSS custom properties** at the top of `src/App.css`, and every box of
  a kind uses them:
  - `--card-bg` / `--card-border` / `--card-shadow` — list cards, Settings cards, changelog cards. A
    faint vertical gradient, a lit top edge and a soft lift.
  - `--btn-bg` / `--btn-border` / `--btn-shadow` — secondary buttons (Settings, dialog Cancel, Check now,
    Add list / Edit order), the IP chip, the gear and the Critical-switch row. A soft 3D gradient.
  - `--brand-btn-bg` / `--brand-btn-shadow` — the primary yellow buttons: Save, Update, Install, Done.
  - `--danger-btn-bg` / `--danger-btn-shadow` — the destructive confirm (same red as a down Critical badge).
  - `--noise` — a fine grain on the window.
- **Light and dark share the code**: colours inside gradients and shadows use `light-dark()`. (It
  accepts colours only, so the values live inside `linear-gradient(...)` / `box-shadow` rather than
  the property being switched.)
- **Status dots are glowing beads** (radial highlight, a ring and a glow). The dot on the site tile has no
  glow (a ring only), because it sits on the tile's corner.
- **Switches** (dialog, Settings, the alert table) share one look: a recessed track, a gradient thumb,
  and a green gradient with a glow when on. They use an inset box-shadow, not a border: a border on a
  gradient background made the gradient tile under it and break the colour at the edge.
- **The orb is a gentle bead**: a soft top highlight and a little shade at the bottom, with the same halo and
  glow in light and dark so its colour does not drift with the theme.
- **Cards are almost opaque** (about 94–95% in dark, 78–86% in light). At about 50–80% the orb's glow tinted
  only the first card, so two neighbouring cards had different backgrounds.
- **The lists' top edge is an eased mask fade, with no blur layer.** The earlier one-strip frost,
  and then three stacked blur layers, always left a seam where the blur ended and showed ghost text. A
  smoothstep alpha mask has no start or end to see.
- **An open multi-host row is one panel** (a faint tint, a ring in light, a thin line under the avatar).
  In light the tint is indigo, not white: white is invisible on a near-white card. Its hover only
  deepens the same panel instead of swapping it for the plain row hover (that flashed).
- The background is a vertical gradient with two faint ambient lights (three soft tints in the light
  theme, which finishes the "color blobs" ADR-0032 left out) and the window gets a fine grain.
- A soft wide yellow glow sits behind the logo (background light, not an outline).
- **Add list / Edit order** are raised buttons that keep their dashed outline.

## Alternatives considered

- **Keep styling each component on its own.** That is how the inconsistencies happened.
- **A frosted blur strip at the scroll edge.** Tried twice; both left a visible line. Dropped.
- **Fully opaque cards.** Removes the tint difference but also the glass feel and the orb's light on the
  cards.
- **A CSS-in-JS / utility-class system.** Far more change than the problem needs; custom properties give
  the one-place definition already.

## Consequences

## **Positive:**

- A new box picks up the look by using a variable; changing the look is one edit.
- Light and dark cannot drift apart for these surfaces.

## **Negative / accepted trade-offs:**

- `light-dark()` colours inside shadows make some declarations long.
- The grain is white, so it is almost invisible in the light theme.
- `--glass-card`, `--chip-bg` and `--chip-ring` were removed from `tokens.css` (no rule read them).
- Only checked in Chromium (Playwright); the real WKWebView, Windows and Linux are unverified.

## **Follow-ups:**

- Remove the three unused tokens.
- Look at the window in the real WKWebView, and at Windows/Linux when those targets ship.
