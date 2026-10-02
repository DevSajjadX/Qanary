# 0035. The tray menu shows each list's status

- **Status:** accepted
- **Date:** 2026-10-01
- **Deciders:** Sajjad (DevSajjadX)

## Context

ADR-0008 gave the tray a context menu of three actions: Show / Hide, Refresh now, Quit. The menu-bar
icon says only the *overall* state, so to see which list is down you had to open the window. Since
ADR-0034 the icon carries more states and a choice of looks; the menu is the natural place for the
per-list detail.

## Decision

- The menu starts with **one row per list**, in the app's order: a coloured dot and
  `name · 4/5` (or `name · All unreachable`, or `name · no services`). A list's emoji, if it has
  one, leads the name. The count is the in-app header's: services that are not `Down`.
- **Dot colour** follows the severity rules the icon already uses: green = fine, orange = a
  non-critical list fully down, red = a critical list fully down, crimson = the whole machine cut
  off, grey = every service still being checked. The dot is drawn at runtime with the icon's palette
  (an `IconMenuItem`; macOS shows menu icons 18 pt square).
- A separator, then the existing Show / Hide, Refresh now, Quit.
- **Clicking a list row shows and focuses the main window.** It never hides it (unlike Show / Hide).
- **When it updates.** `tray::refresh_menu` reads the live snapshot and rebuilds the menu *only if the
  rows changed*, because replacing a menu that is open closes it. It runs after every settled probe
  result, when a checking round starts (lists added, renamed, removed) and after layout changes
  (reorder, collapse, edits) — all with the snapshot lock released.
- The text and dot of each row come from a pure function, `tray_menu::list_lines`, so the rules are
  unit-tested without a window; `tray.rs` only turns the lines into menu items.

## Alternatives considered

- **A disabled "header" row with the overall status.** The icon already says it; the rows are the
  new information.
- **Per-service rows (or a submenu per list).** A long menu on every right-click; the window is
  one click away from there.
- **Unicode ● for the dot.** It cannot be coloured in a native menu.
- **Rebuild the menu on every probe result.** Closes an open menu and wastes work; the diff is
  one `Vec` comparison.
- **Native `CheckMenuItem` or per-list submenus for collapse/expand.** Out of scope.

## Consequences

## **Positive:**

- One right-click answers "what is down?" without opening the window.
- Same wording and colours as the app and the icon.

## **Negative / accepted trade-offs:**

- The menu is native, so it cannot be restyled further (no bold names, no mono counts), and a
  very long list name makes a wide menu.
- A menu that is open while a probe lands keeps showing the old rows until it is reopened.
- Only checked on macOS so far; Windows/Linux render menu icons their own way.

## **Follow-ups:**

- Clicking a row could scroll to or expand that list in the window.
- Check the menu on Windows/Linux when those targets ship.
