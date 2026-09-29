# 0030. Config writes never lose data

- **Status:** accepted
- **Date:** 2026-09-24
- **Deciders:**

## Context

An external audit (2026-09-23, A02/A03/A06) and a follow-up review found four ways the persisted
`config.json` could be lost or silently diverge from what the UI showed:

1. **Corrupt file overwritten at startup.** `store::load` fell back to `Config::default()` on
   invalid JSON, and `take_new_changelog` saved on every launch after an update — so one bad byte
   replaced every custom list with the seeds, with no backup and no message.
2. **Non-atomic save.** `fs::write` truncates first; a crash or full disk mid-write left a
   truncated file, which then hit (1) on the next launch.
3. **Failed saves looked successful.** Every command logged the save error to stderr and returned
   the updated config anyway. The UI showed a change that would vanish on restart.
4. **Disk order ≠ memory order.** Commands cloned the config under the lock, then saved *after*
   releasing it; two quick writes (collapse + reorder) could land on disk in reverse order. The
   lock → clone → save → log sequence was duplicated across seven commands.

A config written by a newer app version (`schema_version > CURRENT_SCHEMA`) had the same problem
as (1) in a quieter form: it loaded, and the next save stripped whatever the newer schema added.

## Decision

- **Atomic save.** `store::save` writes `config.json.tmp`, fsyncs it, and renames it over the
  target. Export uses the same function.
- **Quarantine, never overwrite.** When the file exists but can't be used (unreadable, invalid
  JSON, or a newer schema), `store::load` renames it to `config.json.bad-<unix-ms>` *before*
  returning defaults, and returns a user-facing warning. `AppState.load_warning` holds it; the UI
  takes it once via `take_load_warning` and shows it inline. Chosen over refusing to start: the
  app stays useful and the user's data is one rename away.
- **One write path.** `commands::commit` applies the change to a copy, saves the copy **while
  holding the config lock**, and only then swaps it into memory. `mutate` = `commit` + re-probe.
  Every command that writes config goes through one of them and returns `Result<_, String>`; the
  frontend shows a rejection instead of the change.
- **One host rule.** `store::validate_endpoint` (DNS name, IPv4, or `*.` wildcard; port ≠ 0) is the
  only definition of a valid endpoint. `add_services`/`update_service` call it on input;
  `store::validate` (unique ids, ≥1 endpoint per service, valid endpoints) gates `import_config`.
- **Load stays tolerant of semantic problems.** A loaded file with a malformed host is kept as-is
  (that service probes Down and can be edited). Quarantining a whole config over one bad host —
  including hosts the A01 edit bug already wrote — would cost more than it protects.
- **Dock policy follows the flag on every path.** `apply_dock_policy` is called by settings save,
  reset, import and startup, so the OS state can't drift from `hide_dock` (audit B04).
- **Settings save is one write.** `update_settings` takes one `SettingsPatch` (every field
  optional) that includes `hide_dock`; the separate `set_hide_dock` command from ADR-0009 is gone,
  so Dock and the other settings either both save or neither does. The modal awaits the result
  and stays open with the message on failure.
- **Hosts the old frontend damaged are repaired on load and import.** `store::repair_legacy_hosts`
  undoes the audit-A01 corruption (`"x.com: x.com"` stored as both host and label, a non-443
  port lost to 443 — no valid host contains `": "`, so the last segment is the real host; the
  label is restored only when it equals the damaged host) and drops the path the old URL parser
  kept (`x.com/inbox` → `x.com`). So every config the app itself exported re-imports. A repaired
  load is saved straight back.

## Alternatives considered

- **Keep a rolling `config.json.bak` on every save** — protects against a bad *write*, which the
  atomic rename already does; doesn't help when the bad file came from outside.
- **Refuse to start on an unusable or newer config** — safest for the data, but leaves a monitor
  app not monitoring; the backup gives the same safety.
- **Validate the whole config on every mutation** — would block every edit for users whose config
  already holds an A01-corrupted host. Validating the input instead keeps the rule in one place
  without that trap.

## Consequences

**Positive:** no path overwrites or truncates a user's config; saves reach disk in the order they
reach memory; a failed or refused save is visible; one helper replaces seven copies.

**Negative / accepted trade-offs:** the config lock is held across a small blocking file write
(never across an `.await`). A host malformed some way other than those two legacy patterns (a
hand-edit) still blocks its import until the user fixes it.

**Follow-ups:** `timeout_ms` has no bounds check yet (not user-editable, only reachable by
hand-edit or import).
