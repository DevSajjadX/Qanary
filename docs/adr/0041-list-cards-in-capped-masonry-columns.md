# 0041. List cards sit in capped masonry columns, centered

- **Status:** accepted
- **Date:** 2026-10-02
- **Deciders:** Esi-Abolfazl

## Context

The lists stretched to the window. Full screen, a row ran a few thousand pixels from name to
latency. A CSS grid of rows fixed the width but left a hole under every short list.

## Decision

- `src/utils/listColumns.ts` is the one source of the numbers: a column needs 360px (`LIST_MIN_PX`),
  a card is at most 480px (`LIST_MAX_PX`), 7px gap, 12px edges. App.tsx hands them to CSS as
  `--cols`, `--list-max`, `--list-gap`, `--list-edge`.
- `columnCount` fits columns into the window width (never more than there are lists).
- `toColumns` deals the lists, in order, onto the shortest column (height ≈ services + 2).
- The block is as wide as its columns and centered; the hero and notices share its edges.
- Edit order is always one column, so dragging stays a straight vertical move.

## Alternatives considered

- **CSS `grid` with auto-fill rows** — holes under short lists, empty tracks with few lists.
- **CSS `columns` / native masonry** — `columns` reorders lists top-to-bottom per column and
  splits cards; grid masonry isn't shipped in WebKit.
- **Limiting the window width** — fights the user's own window choice.

## Consequences

**Positive:** readable rows at any size; the same rule from 460px to full screen.

**Negative / accepted trade-offs:** heights are estimated, not measured — collapsed lists and
expanded hosts can leave columns uneven. Measuring would move cards every time one opens.

**Follow-ups:** measure heights only if uneven columns become a real complaint.
