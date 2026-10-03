# 0046. The switches return to the v0.6.5 switch

- **Status:** accepted (amends ADR-0037: the switches' size and green "on" look)
- **Date:** 2026-10-03
- **Deciders:** Esi-Abolfazl

## Context

The Glass redesign enlarged every switch to 42×25 and drew it with a recessed track, a gradient
knob, and a green gradient with a glow when on. Three rules each repeated all of it: `Switch`, the
List dialog's Critical switch, and the alert-table checkboxes. The volume slider next to them is a
native range input in the brand gold. v0.6.5 had a smaller, flat gold switch, and the owner wants
it back exactly, size included, so the controls read as one set.

## Decision

- Every switch is the v0.6.5 switch as it was: a 36×20 track, a flat white 16px knob, the `--border`
  color when off and flat `--switch-on` (`#ffcc00`, v0.6.5's brand gold) when on. No gradient,
  glow or inset shadow. Focus is a 2px gold outline.
- One rule set in `App.css` draws all three hosts (`.switch-track`, `.modal-switch`, the alert-table
  checkbox), so they can't drift apart again.
- `--switch-on` is its own token (`tokens.css`). Glass lightened `--brand` to `#ffd23f`, and the
  owner wants the switch gold unchanged.
- The green "Update ready" button stays green. It is a success state, not a switch.

## Alternatives considered

- **Keep the Glass switch and only recolor it gold.** Tried first; the owner wanted the old size
  and flat look too.
- **Use `--brand` for the track.** A slightly lighter gold than the old switch.
- **Restyle the slider green instead.** Green has no brand role. Gold is the brand's control color
  (Save, Done, the slider).

## Consequences

## **Positive:**

- The switches look as they did in v0.6.5 and match the gold slider. The same CSS draws them on
  macOS, Windows and Linux.
- One rule set instead of three copies.

## **Negative / accepted trade-offs:**

- Two golds now exist: `--switch-on` (`#ffcc00`) and `--brand` (`#ffd23f`, the buttons). They are
  close, but not equal.
- The flat switch is the one control without the Glass depth.

## **Follow-ups:**

- None.
