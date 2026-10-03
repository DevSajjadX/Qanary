//! The macOS app menu (the menu bar at the top of the screen while Qanary is active).
//!
//! Starts from Tauri's default menu, so Edit (copy/paste in inputs), Window and the rest keep
//! working, and adds:
//!   - Qanary › Settings…  ⌘,
//!   - File › New list     ⌘N
//!   - File › Edit order   ⇧⌘O
//!   - View › Refresh now  ⌘R
//!
//! Refresh runs in the backend, like the tray's. The backend owns no UI for the others: a click
//! shows the window and emits `menu-action` with the action name; the frontend opens the matching
//! screen (`onMenuAction` in `src/api.ts`).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Emitter, Manager};

/// Event the frontend listens to. Payload: one of the `ACTIONS` names.
pub const EVENT_MENU: &str = "menu-action";

/// (menu item id = action name sent to the frontend, label, shortcut). The ids are prefixed so
/// they can never collide with the tray menu's.
const SETTINGS: (&str, &str, &str) = ("app-settings", "Settings…", "CmdOrCtrl+,");
const NEW_LIST: (&str, &str, &str) = ("app-add-list", "New list", "CmdOrCtrl+N");
const EDIT_ORDER: (&str, &str, &str) = ("app-edit-order", "Edit order", "CmdOrCtrl+Shift+O");
const REFRESH: (&str, &str, &str) = ("app-refresh", "Refresh now", "CmdOrCtrl+R");

/// The action name the frontend sees for a menu item id: the id without its `app-` prefix.
fn action_of(id: &str) -> Option<&str> {
    [SETTINGS.0, NEW_LIST.0, EDIT_ORDER.0]
        .contains(&id)
        .then(|| &id["app-".len()..])
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let item = |(id, label, keys): (&str, &str, &str)| {
        MenuItem::with_id(app, id, label, true, Some(keys))
    };
    let menu = Menu::default(app)?;
    let items = menu.items()?;
    // Default layout: [app menu, File, Edit, View, Window, Help]. The app menu starts
    // About · separator, so Settings goes right under About, as in every Mac app.
    if let Some(app_menu) = items.first().and_then(|i| i.as_submenu()) {
        let sep = PredefinedMenuItem::separator(app)?;
        app_menu.insert_items(&[&item(SETTINGS)?, &sep], 2)?;
    }
    if let Some(file) = items.iter().filter_map(|i| i.as_submenu()).find(|s| s.text().is_ok_and(|t| t == "File")) {
        let sep = PredefinedMenuItem::separator(app)?;
        file.insert_items(&[&item(NEW_LIST)?, &item(EDIT_ORDER)?, &sep], 0)?;
    }
    if let Some(view) = items.iter().filter_map(|i| i.as_submenu()).find(|s| s.text().is_ok_and(|t| t == "View")) {
        let sep = PredefinedMenuItem::separator(app)?;
        view.insert_items(&[&item(REFRESH)?, &sep], 0)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == REFRESH.0 {
            crate::commands::refresh_now(app.clone());
            return;
        }
        let Some(action) = action_of(event.id().as_ref()) else { return };
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
        let _ = app.emit(EVENT_MENU, action);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_ids_map_to_the_frontend_action_names() {
        assert_eq!(action_of("app-settings"), Some("settings"));
        assert_eq!(action_of("app-add-list"), Some("add-list"));
        assert_eq!(action_of("app-edit-order"), Some("edit-order"));
        // Tray menu ids and Tauri's predefined items are not ours.
        assert_eq!(action_of("quit"), None);
        assert_eq!(action_of("app-unknown"), None);
        // Refresh never reaches the frontend: the backend runs it.
        assert_eq!(action_of(REFRESH.0), None);
    }
}
