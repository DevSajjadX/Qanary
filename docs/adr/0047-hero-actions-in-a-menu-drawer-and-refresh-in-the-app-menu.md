# 0047. Hero actions fold into a ☰ drawer; Refresh joins the app menu

- **Status:** accepted (amends ADR-0045: the hero's + and gear give way to one ☰)
- **Date:** 2026-10-03
- **Deciders:** Esi-Abolfazl

## Context

ADR-0045 put Add list as a round + beside the Settings gear. The owner wanted a single ☰ in that
spot instead, opening a glass drawer with Settings, Edit order and Add list as icons, each named on
hover. They also wanted the orb's refresh reachable by a keyboard shortcut, like the other actions.

## Decision

- **☰ drawer** (`HeroMenu.tsx`). The ☰ keeps the gear's alignment over the lists' right-hand icon
  column. Clicking it grows a glass capsule (the `.hero-btn` surface) out to its left, and the ☰
  turns into a › (chevron-right) that caps the capsule's end and points the way it closes.
  - The actions sit right to left: Add list, Edit order, Settings. The nearest comes first in Tab
    order and in the entrance.
  - Icons only. The name and the macOS shortcut show in a glass tip under the icon on hover or
    keyboard focus.
  - Motion: the capsule stretches out with a slight overshoot, and the icons spin in one after
    another (40 ms + 45 ms per step). Closing slides the capsule shut to the right into the ☰,
    each icon travelling with it, so the drawer folds back where it came from rather than fading
    in place. Reduced motion is a plain fade.
  - The drawer closes after a pick, on Escape (focus goes back to the ☰), or on a click outside.
    Closed, it is unmounted (`useCollapsible`), so its buttons are not in the Tab order or the
    accessibility tree.
- **Edit order is back in the hero.** It is disabled with no lists and shows pressed while
  ordering. A second click, or a second ⇧⌘O, ends ordering: the drawer and the native menu share
  one toggle (`toggleEditOrder` in `App.tsx`), gated by `canEditOrder`.
- **View › Refresh now ⌘R** in the macOS app menu (`app_menu.rs`). The backend runs it directly,
  like the tray's Refresh now. The orb's title names the shortcut.
- **One refresh path.** The tray, the network watcher and the menu all call
  `commands::refresh_now`, instead of three copies of its two steps.

## Alternatives considered

- **Keep the + and gear (ADR-0045).** Two always-visible buttons. The owner preferred one control
  and a drawer.
- **A dropdown list under the ☰ (v0.6.5).** Text rows read as a separate menu, not part of the
  hero's glass. The drawer keeps the hero's icon language.
- **Send ⌘R to the frontend and have it click the orb.** That would route a backend action
  through the UI. The tray already refreshes in the backend.

## Consequences

## **Positive:**

- The hero bar holds one control. All three actions plus refresh have Mac shortcuts.
- Refresh logic lives in one function.

## **Negative / accepted trade-offs:**

- Settings and Add list take two clicks instead of one (⌘, and ⌘N stay one keystroke).
- ⌘R refreshes even while a round is in flight or the Mac is offline. The orb is disabled in
  both cases. The tray behaves the same way, and an extra round is harmless.
- The tips show macOS shortcuts. They will need platform-specific text when the Windows port
  starts.

## **Follow-ups:**

- Windows/Linux: shortcut text in the tips (TODO, with ADR-0045's shortcut follow-up).
