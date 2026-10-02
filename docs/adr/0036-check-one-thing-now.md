# 0036. Clicking a name re-checks just that: a service, a group, a host or a list

- **Status:** accepted
- **Date:** 2026-10-01
- **Deciders:** Sajjad (DevSajjadX)

## Context

The only way to re-check was Refresh, which probes **everything** (every service, plus the WAN
lookup). To see whether one site had recovered you waited for all of them, and a multi-host group
like Claude could not be re-checked on its own. The probe tasks already run one per service
(ADR-0014), so the backend can do this without a new scheduler.

## Decision

- **What a click does.** The name of a **service** re-checks that service (every host of it, for
  a group). A **host** inside an opened group re-checks just that host. The name chip of a **list**
  re-checks every enabled service of that list. Refresh (orb, tray) is unchanged.
- **Backend: two commands.** `check_now(list_id, service_id, endpoint_id?)` and
  `check_list(list_id)`. Neither touches the schedule, other services, or the WAN task.
  - The target is marked `Checking` in the snapshot at once and a Status delta is emitted, so the
    UI shows it immediately.
  - The probe runs on a one-off task (the same `probe_service`, narrowed to one endpoint when
    asked) and its result lands through the same path as any probe: under the snapshot lock, with
    the generation check (a result for a config that no longer exists is dropped), then the tray
    updates. A single host's result is merged into the service's *current* status, so it can't
    clobber a result that landed meanwhile.
  - Errors only for something that can't be checked (unknown/disabled service, unknown endpoint).
- **A one-off check is local.** Marking the target `Checking` changes only that row: `all_down`,
  `overall`, `cut_off` and `settled` stay as they were (`mark_checking`), so the rest of the app
  does not look like it is refreshing (gray orb) and an offline machine does not flip out of
  "offline" for the length of one probe. The real result goes through the normal rollup
  (`recompute_delta`). The hero reads "busy" from `settled`, so only a full round makes it busy.
- **The frontend never diffs a snapshot that still has a Checking row** (`isSettled`), even when
  `settled` is true. Otherwise re-checking one service of a list that is already fully blocked would
  look like the list newly *becoming* blocked and alert a second time (ADR-0027/0029).
- **Frontend.** Names and hosts are buttons that look like text, with a dotted underline on hover
  and a tooltip. The list chip is the whole click target, with a real button inside it so keyboards
  can reach it. A name already being checked ignores clicks; in reorder mode names are plain text.
- **Feedback: "Pinging…"** with three dots lighting in turn replaces the latency while a service
  or host is being checked (also on a full refresh). Reduced motion keeps the dots still.
- **Expanding a group moved.** The name used to toggle it; now the chevron or any other part of the
  row does.
- **Closed group shows `~87 ms`:** the rounded mean of its hosts that are Up (Down, Blocked,
  TCP-only Reachable and Checking have no comparable latency), with a tooltip giving the count and
  the fastest/slowest. Hidden when open (each host shows its own) and while checking.

## Alternatives considered

- **Wake the existing probe task of that service** (a second broadcast channel). Reuses the loop,
  but a missed or mismatched signal gets re-armed with the wrong sleep, and a single host still
  needs its own path. A one-off task is simpler and has the same landing path.
- **Probe from the frontend.** The webview cannot do TCP connects.
- **A separate "re-check" button on every row.** More chrome on a calm list; the name is the thing
  you are looking at.
- **Median instead of mean for the group.** More honest with one slow host, but harder to explain;
  the tooltip's range covers it.

## Consequences

## **Positive:**

- Checking one site no longer costs a full round, and a group can be checked or drilled into.
- The same Status-delta path means the tray, alerts and snapshot rules need no special case.

## **Negative / accepted trade-offs:**

- A one-off check and the scheduled probe of the same service can overlap; the later result wins
  (they measure the same thing). If another service's scheduled result lands during a one-off check,
  that one delta is rolled up with the row still Checking, so the hero can blink busy for a moment.
- The backend gains two commands, in a PR that was otherwise a frontend redesign plus the tray.
- Users used to opening a group by clicking its name now get a re-check instead; they must use the chevron (or the rest of the row).

## **Follow-ups:**

- Reset a service's own interval/backoff after a manual check, if that proves wanted.
- A median option for the group figure.
