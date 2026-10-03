# 0045. Add list moves beside the gear; a native app menu carries the list and settings actions

- **Status:** accepted (amends ADR-0037: the Add list / Edit order bar under the lists is gone); the hero part amended by ADR-0047
- **Date:** 2026-10-03
- **Deciders:** Esi-Abolfazl

## Context

The Glass redesign put **Add list** and **Edit order** in a bar of two large dashed buttons under
the last list. They are rare actions, and the bar competed with the status content. The owner
looked at four alternatives: a ghost "New list" tile, a + beside the gear, the v0.6.5 ☰ menu, and
native menu items with shortcuts. **Edit order** was a duplicate anyway: every list's ··· menu
already has it.

## Decision

- **Add list** is a round + button beside the Settings gear, top right, in the gear's glass style
  (`.hero-btn`). The gear keeps its alignment over the lists' right-hand icon column.
- **Edit order** lives only in each list's ··· menu.
- The bar under the lists is removed. The "No lists yet — Add list" empty state stays.
- **macOS app menu** (`src-tauri/src/app_menu.rs`). It starts from Tauri's default menu, so Edit
  (copy/paste), Window and the rest still work, and adds:
  - Qanary › Settings… ⌘,
  - File › New list ⌘N
  - File › Edit order ⇧⌘O
- A menu click shows and focuses the window, then emits `menu-action` (`"settings"`, `"add-list"`
  or `"edit-order"`). The frontend opens the matching screen (`onMenuAction` in `api.ts`). The
  backend owns no UI here.
- A menu action is ignored while a dialog is open. Replacing that dialog would drop its unsaved
  edits.

## Alternatives considered

- **Ghost "New list" tile at the end of the lists.** Quiet and placed where the list will appear,
  but the owner preferred an always-visible control at the top.
- **The v0.6.5 ☰ menu in place of the gear.** Familiar, but it puts Settings one click deeper and
  hides both actions.
- **Native menu on Windows/Linux too.** There the menu bar sits inside the window, and the Glass
  layout has no room for it.

## Consequences

## **Positive:**

- The list area is only content. Add list is one click away, and on the Mac a shortcut away.
- Settings opens with the standard ⌘, like any Mac app.

## **Negative / accepted trade-offs:**

- With **Hide Dock icon** on (Accessory mode), macOS shows no app menu, so the shortcuts are gone.
  The hero buttons still work.
- The status hero now holds two buttons instead of one.
- The macOS menu is built off Tauri's default layout: the app menu first, About then a separator,
  and a "File" submenu. A Tauri change to that layout would drop the new items without an error.

## **Follow-ups:**

- Windows/Linux: decide on shortcuts without a menu bar when the Windows port starts.
