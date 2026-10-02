//! What the tray menu says about each list — pure, so it can be tested without a window.
//!
//! `tray.rs` turns these lines into menu rows (a coloured dot + a label). The wording and the
//! count mirror the in-app list header (`ServiceList.tsx`): `up/total`, or "All unreachable" when
//! the whole list is down. The dot follows the same severity rules as the tray icon itself.

use crate::models::{ListStatus, ServiceState};

/// The coloured dot beside a list's row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dot {
    /// Reachable.
    Ok,
    /// A non-critical list is fully down — heads up.
    Warn,
    /// A critical list is fully down.
    Alarm,
    /// The whole machine is cut off from the network.
    Offline,
    /// Every service in the list is still being probed.
    Checking,
}

/// One list's row in the menu. `id` is the list id, used to build the menu item id.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListLine {
    pub id: String,
    pub label: String,
    pub dot: Dot,
}

/// One row per list, in the app's order. `cut_off` (nothing reachable anywhere) turns every dot
/// to Offline, like the in-app all-red lists.
pub fn list_lines(lists: &[ListStatus], cut_off: bool) -> Vec<ListLine> {
    lists
        .iter()
        .map(|l| {
            let total = l.services.len();
            // "Up" is "not Down", as in the app's header count (a Blocked service still answers TCP).
            let up = l.services.iter().filter(|s| s.state != ServiceState::Down).count();
            let status = if total == 0 {
                "no services".to_string()
            } else if l.all_down {
                "All unreachable".to_string()
            } else {
                format!("{up}/{total}")
            };
            let name = if l.icon.is_empty() { l.name.clone() } else { format!("{} {}", l.icon, l.name) };

            let dot = if cut_off {
                Dot::Offline
            } else if total > 0 && l.services.iter().all(|s| s.state == ServiceState::Checking) {
                Dot::Checking
            } else if l.all_down {
                if l.critical { Dot::Alarm } else { Dot::Warn }
            } else {
                Dot::Ok
            };
            ListLine { id: l.id.clone(), label: format!("{name} · {status}"), dot }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ServiceStatus;

    fn list(id: &str, name: &str, icon: &str, critical: bool, states: &[ServiceState]) -> ListStatus {
        let services: Vec<ServiceStatus> = states
            .iter()
            .enumerate()
            .map(|(i, s)| ServiceStatus {
                id: format!("s{i}"),
                label: format!("s{i}"),
                state: *s,
                endpoints: vec![],
            })
            .collect();
        // all_down is the backend's rollup; for these tests "every service is Down" is enough.
        let all_down = !services.is_empty() && services.iter().all(|s| s.state == ServiceState::Down);
        ListStatus {
            id: id.into(),
            name: name.into(),
            icon: icon.into(),
            services,
            all_down,
            collapsed: false,
            critical,
        }
    }

    use ServiceState::{Blocked, Checking, Down, Reachable, Up};

    #[test]
    fn shows_the_up_count_like_the_app_header() {
        let lines = list_lines(&[list("a", "Internet", "🌐", false, &[Up, Up, Down, Reachable, Blocked])], false);
        assert_eq!(lines.len(), 1);
        // 4 of 5 are not Down (Blocked still counts as up, exactly as in ServiceList.tsx).
        assert_eq!(lines[0].label, "🌐 Internet · 4/5");
        assert_eq!(lines[0].dot, Dot::Ok);
        assert_eq!(lines[0].id, "a");
    }

    #[test]
    fn a_fully_down_list_says_all_unreachable() {
        let lines = list_lines(&[list("a", "Iran", "", true, &[Down, Down])], false);
        assert_eq!(lines[0].label, "Iran · All unreachable");
        assert_eq!(lines[0].dot, Dot::Alarm, "critical + all down");
        let lines = list_lines(&[list("a", "Global", "", false, &[Down, Down])], false);
        assert_eq!(lines[0].dot, Dot::Warn, "non-critical + all down only warns");
    }

    #[test]
    fn partly_down_is_not_an_alarm() {
        let lines = list_lines(&[list("a", "Iran", "", true, &[Up, Down])], false);
        assert_eq!(lines[0].label, "Iran · 1/2");
        assert_eq!(lines[0].dot, Dot::Ok);
    }

    #[test]
    fn checking_and_empty_lists() {
        let lines = list_lines(
            &[list("a", "A", "", false, &[Checking, Checking]), list("b", "B", "", false, &[])],
            false,
        );
        assert_eq!(lines[0].dot, Dot::Checking);
        assert_eq!(lines[1].label, "B · no services");
        assert_eq!(lines[1].dot, Dot::Ok, "an empty list is not a problem");
        // One service answered: no longer "all checking".
        let mixed = list_lines(&[list("a", "A", "", false, &[Checking, Up])], false);
        assert_eq!(mixed[0].dot, Dot::Ok);
    }

    #[test]
    fn cut_off_turns_every_dot_offline_and_keeps_the_order() {
        let lines = list_lines(
            &[list("1", "First", "", false, &[Up]), list("2", "Second", "", true, &[Down])],
            true,
        );
        assert_eq!(lines.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), ["1", "2"]);
        assert!(lines.iter().all(|l| l.dot == Dot::Offline));
    }
}
