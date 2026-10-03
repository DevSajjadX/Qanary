# 0038. Both orb styles move in every state

- **Status:** accepted; offline icon and where the Pulse Alarm loop starts superseded by ADR-0043
- **Date:** 2026-10-02
- **Deciders:** Sajjad (DevSajjadX)

## Context

ADR-0033 added the Pulse style. Rings were static after their draw-in, and in Pulse only the calm and
warn beats (and the Alarm dashes) moved; Offline stood still. Both styles can say more with motion, as
long as it stays calm: the orb is always on screen.

Each motion was chosen from live samples of several ideas per state, so this records the choices.

## Decision

All motion starts after the icon has drawn in, and is off for `prefers-reduced-motion`.

**Rings** (CSS on the rings, `orb-icon-rings[data-mood]`):

| State | Motion |
|---|---|
| All clear | slow breathing (3.2 s), the outer rings a beat behind |
| Heads up | the dashed outer ring turns very slowly (18 s a turn), the inner ring breathes, the "!" blinks softly |
| Alarm | a double heartbeat, then a pause (3 s) |
| Offline | the rings slowly sink back (4 s); the slash fades in and out |
| Refreshing | a fast ripple outward, each ring in turn (1.4 s) — replaces the earlier light wave |

**Pulse:**

| State | Motion |
|---|---|
| All clear, Heads up, Refreshing | unchanged (the gradient line with a running light, 2.8 / 1.9 / 1.2 s) |
| Offline | the dashed line crawls (2 s a step, slower than Alarm); its ends fade like the rest; the slash blinks softly like the Rings one |
| Alarm | a 20 s story on a loop: a heartbeat runs for about two seconds, stutters, shrinks and is wiped away from the right; the dead dashed line then crawls with the X for about 17 s; it fades and starts again |

- The Alarm loop is long on purpose: the moving dashes are on show for well over 15 s of every 20,
  so the state reads as "dead line" rather than as a repeating flicker.
- Pulse Alarm has a new path, `.pulse-beat`. With reduced motion it stays hidden, and the dashed line
  and the X are what remain, so the state still reads without animation.
- The Rings keyframes are in `App.css` (`orb-breathe`, `orb-turn`, `orb-beat`, `orb-sink`,
  `orb-blink`, `orb-ring-ripple`); the Pulse Alarm ones are `orb-drain-beat/flat/x`.

## Alternatives considered

- **Leave Rings static.** Fine, but a living icon fits the canary idea, and calm motion is cheap.
- **Pulse Alarm as a plain dashed line and a beating X** (what it was). Reads, but says less than
  "the heartbeat failed", and it did not echo the Rings heartbeat.
- **A short (4.6 s) failing-heartbeat loop.** Tried first; replaced by the 20 s version so the dead
  line is what you mostly see.
- **A frantic Alarm (strobe, shake).** Too loud for something always on screen.

## Consequences

## **Positive:**

- Each state has its own motion in both styles, and none is faster than the thing it describes.
- Everything is CSS, so reduced motion is one switch.

## **Negative / accepted trade-offs:**

- Several infinite animations run at once; they are transforms and opacity only.
- Verified by sampling computed styles in Chromium, not by eye in the real WKWebView.

## **Follow-ups:**

- The menu-bar (tray) icon is a still picture and stays that way.
