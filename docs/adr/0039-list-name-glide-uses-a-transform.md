# 0039. A long list name glides with a transform, not scrollLeft

- **Status:** accepted
- **Date:** 2026-10-02
- **Deciders:** Sajjad (DevSajjadX)

## Context

A long list name is cut with an ellipsis; while the pointer is on its chip it scrolls to its end and
eases back (`useHoverScroll`, ADR-0032). Two things were wrong with scrolling it by `scrollLeft`:

- **Jitter.** `scrollLeft` moves in whole pixels. The glide is slow (about 13 ms a pixel), so the
  text jumped one pixel, paused, and jumped again. Sampling it frame by frame gave `0 0 0 1 1 1 2 2 2 3…`.
- **Empty space at the end** (seen in WebKit). For a `<button>` the scroll width can come out wider than
  its text, so the glide ended on blank space after the last letter.

## Decision

- The clipped element (the button) has one child, a `<span>`, which is the text run. The hook moves the
  *run* with `transform: translate3d(-x px, 0, 0)`.
- The distance is `run.getBoundingClientRect().width − el.clientWidth`: the run's own width, exact
  and in sub-pixels.
- On hover the run becomes `display: inline-block` (a transform needs a box) and the ellipsis is turned
  off; when the glide back finishes, both are reset. Reduced motion does nothing.

## Alternatives considered

- **Keep `scrollLeft`** and add easing tricks — cannot beat whole-pixel steps.
- **A CSS `@keyframes` marquee** — it cannot know the distance (it depends on the text), and it would
  not stop at the end and ease back on leave.
- **`element.animate()` (WAAPI).** Would work, but jsdom has none, so the hook would need a second code
  path for tests; a requestAnimationFrame glide is testable with fake timers.

## Consequences

## **Positive:**

- Frame-by-frame the shift is smooth (`0.04 0.10 0.18 0.28 …`), and the last letter ends at the edge.

## **Negative / accepted trade-offs:**

- The markup has an extra `<span>` inside the name button, and the hook relies on it being the first child.
- Checked in Chromium; the WebKit "empty space" case is fixed by design, not yet seen fixed there.
