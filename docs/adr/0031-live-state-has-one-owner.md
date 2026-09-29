# 0031. Live state has one owner: backend layout, one snapshot setter, one updater

- **Status:** accepted
- **Date:** 2026-09-30
- **Deciders:** Esi-Abolfazl

## Context

The 2026-09-23 audit (A05, A12, R3) and its follow-up review found the same fault in three places:
two copies of one piece of live state, each updated on its own schedule.

1. **Layout.** A reorder or collapse was painted into React state, but the delta merge base
   (`prevSnapshotRef`) and the backend's live snapshot kept the old layout. The next
   `service-update` merged onto the old base and reverted the edit on screen; the next
   `status-update` from the WAN task did the same from the backend side. `ServiceList` also kept
   its own `collapsed` copy (ADR-0004), which a remount in reorder mode reset.
2. **Probe results across a config change.** `respawn_tasks` aborts the old tasks, but `abort()`
   only lands at an await: a task past its probe could still write a result for the old config
   over the fresh Checking snapshot.
3. **Updates.** App and Settings each held an update phase and version, and `update.ts` replaced
   its pending handle whenever a check saw a newer version — so after downloading 1.0.1, a check
   finding 1.0.2 made "Install" install a handle that was never downloaded (ADR-0015's
   "newer version → reset to available" rule allowed exactly that).

## Decision

- **The backend owns layout.** `reorder_lists`, `reorder_services` and `set_list_collapsed` save
  the config, then `emit_layout` applies it to the live snapshot (`probe::sync_layout`) and emits
  it under the snapshot lock. The frontend paints optimistically through `showSnapshot` — the only
  function that sets the rendered snapshot, and it moves the merge base in the same call. A
  refused write reports and repaints from `get_snapshot`. `ServiceList` reads `list.collapsed`;
  it has no local copy (supersedes ADR-0004's "frontend holds local collapsed state").
- **Probe results carry a generation.** `respawn_tasks` bumps `AppState.generation`; every task
  gets the value it was spawned with, and `scheduler::accept_result` drops a result whose
  generation isn't current. The check runs under the snapshot lock, and so does every emit.
- **App owns the updater.** App holds phase, version and progress and passes them to Settings as
  one `updater` prop with `check` and `installNow`. Once a download starts, `update.ts` pins that
  handle, and `nextUpdatePhase` keeps `downloading`/`ready` even when a newer version is seen: what
  is on disk installs, and the newer release is found after relaunch (supersedes ADR-0015's reset
  rule). Callback-visible refs (`updatePhaseRef`, `configRef`) are written in the same call as
  their state, never in an effect.

## Alternatives considered

- **Keep ADR-0004's local collapse state and re-sync on mount** — two copies still disagree
  between the mount and the next snapshot; one owner removes the case.
- **Cancel stale probe tasks harder instead of tagging results** — Tokio has no synchronous
  cancel; any result already computed would still race the new snapshot.
- **Re-download when a newer version appears after a download** — throws away a finished
  download and can loop on a slow link; the newer version is one relaunch away.
- **A `useUpdater()` hook shared by App and Settings** — two hook instances are two states; a
  prop from the single owner is the only way both views show the same thing.

## Consequences

**Positive:** a layout edit, a probe result and an update each have one place that decides them;
no delta, WAN refresh or remount can revert what the user just did.

**Negative / accepted trade-offs:** a layout write is a disk save plus a full snapshot emit per
drag. An update found after a download waits for the next launch.

**Follow-ups:** none.
