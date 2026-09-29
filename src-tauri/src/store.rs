//! Loading and saving the persisted `Config` as JSON.
//!
//! The path comes from Tauri's per-app config dir (see `lib.rs`); on macOS that's
//! `~/Library/Application Support/Qanary/config.json`. A missing file seeds `Config::default()`.
//! A file we can't use (unreadable, invalid JSON, written by a newer app) is never overwritten:
//! it is moved aside to `config.json.bad-<ms>` first, then the app starts from defaults and
//! reports it once through `take_load_warning` (ADR-0030).

use crate::models;
use crate::models::{Config, Endpoint, CURRENT_SCHEMA};
use std::collections::HashSet;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Read config from `path`. Returns the config plus a user-facing warning when the file existed
/// but couldn't be used (it has been moved aside, see `quarantine`). Runs `migrate` + normalize.
///
/// Load is deliberately tolerant of *semantic* problems (a malformed host just probes Down and the
/// user can edit it); only `import_config` and edits are held to `validate`.
pub fn load(path: &Path) -> (Config, Option<String>) {
    let contents = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) if e.kind() == ErrorKind::NotFound => return (Config::default(), None),
        Err(e) => return quarantine(path, &format!("couldn't be read ({e})")),
    };
    let mut cfg: Config = match serde_json::from_str(&contents) {
        Ok(c) => c,
        Err(e) => return quarantine(path, &format!("isn't valid ({e})")),
    };
    if cfg.schema_version > CURRENT_SCHEMA {
        // Saving it back would silently strip whatever the newer schema added.
        return quarantine(
            path,
            &format!("was written by a newer version of Qanary (schema {})", cfg.schema_version),
        );
    }
    migrate(&mut cfg);
    normalize_alerts(&mut cfg);
    if repair_legacy_hosts(&mut cfg) > 0 {
        if let Err(e) = save(path, &cfg) {
            eprintln!("qanary: repaired config but couldn't save it ({e}); will retry on next change");
        }
    }
    (cfg, None)
}

/// Undo the two ways pre-0.6.5 frontends saved a host that can never probe Up.
///
/// 1. The edit dialog (audit A01). Editing a service whose label had a dot (every bare-host
///    service: label = host) serialised it as `"L: H[:port]"` and parsed that back as one literal
///    host — and, since the parsed label defaulted to that host, as the label too. Each further
///    edit prefixed another `"L: "`. No valid host contains `": "`, so the last `": "` segment is
///    the host the user typed; the label is restored only when it is exactly the damaged first
///    host (the bug's fingerprint), so a label a user chose to write with a colon is left alone.
/// 2. The old URL parser kept a pasted URL's path, so `https://x.com/inbox` was saved as host
///    `x.com/inbox`. An endpoint is host + port only: the path/query/fragment is dropped.
///
/// A candidate is applied only when it passes `validate_endpoint`. Returns how many endpoints it
/// fixed. Called by load and import, so every config the app itself exported re-imports.
pub fn repair_legacy_hosts(cfg: &mut Config) -> usize {
    let mut fixed = 0;
    for svc in cfg.lists.iter_mut().flat_map(|l| l.services.iter_mut()) {
        let damaged_first = svc.endpoints.first().map(|e| e.host.clone());
        for ep in svc.endpoints.iter_mut() {
            let (mut host, mut port) = (ep.host.clone(), ep.port);
            if let Some((_, last)) = ep.host.rsplit_once(": ") {
                match last.rsplit_once(':') {
                    Some((h, p)) => match p.parse::<u16>() {
                        Ok(p) => (host, port) = (h.to_string(), p),
                        Err(_) => continue,
                    },
                    None => host = last.to_string(),
                }
            }
            if let Some(i) = host.find(['/', '?', '#']) {
                host.truncate(i);
            }
            if (host.as_str(), port) != (ep.host.as_str(), ep.port)
                && validate_endpoint(&host, port).is_ok()
            {
                ep.host = host;
                ep.port = port;
                fixed += 1;
            }
        }
        if damaged_first.as_deref() == Some(svc.label.as_str()) {
            if let Some((original, _)) = svc.label.split_once(": ") {
                svc.label = original.to_string();
            }
        }
    }
    fixed
}

/// Move an unusable config aside so no later `save` can overwrite it, and fall back to defaults.
fn quarantine(path: &Path, reason: &str) -> (Config, Option<String>) {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let backup = path.with_extension(format!("json.bad-{ms}"));
    let msg = match fs::rename(path, &backup) {
        Ok(()) => format!(
            "Your settings file {reason}. It was kept as {} and Qanary started with the default lists.",
            backup.display()
        ),
        // A same-dir rename only fails when the dir isn't writable — and then `save`'s own
        // tmp-file + rename fails too, so the original file still can't be overwritten.
        Err(e) => format!(
            "Your settings file {reason} and couldn't be backed up ({e}). Qanary started with the default lists; changes may not be saved."
        ),
    };
    eprintln!("qanary: {msg}");
    (Config::default(), Some(msg))
}

/// Run all pending schema migrations until `cfg.schema_version == CURRENT_SCHEMA`.
/// Called by `load()` and `import_config` so both paths share one upgrade chain.
///
/// Adding a new migration step:
///   1. Bump `CURRENT_SCHEMA` in `models.rs`.
///   2. Add a new `match` arm here for the old version number.
/// Additive fields with `#[serde(default)]` do NOT need a step — serde fills the default.
pub fn migrate(cfg: &mut Config) {
    while cfg.schema_version < CURRENT_SCHEMA {
        match cfg.schema_version {
            0 => {
                // Step 0→1: fold legacy {host, port} fields into the `endpoints` vec.
                // Configs written before the multi-endpoint model stored a single host+port
                // at the service level; this moves them into endpoints[0].
                for list in cfg.lists.iter_mut() {
                    for svc in list.services.iter_mut() {
                        if svc.endpoints.is_empty() {
                            if let Some(host) = svc.host.take() {
                                let port = svc.port.take().unwrap_or(443);
                                svc.endpoints.push(Endpoint::new(&host, port));
                            }
                        } else {
                            // endpoints already present — clear any stale legacy fields
                            svc.host = None;
                            svc.port = None;
                        }
                    }
                }
            }
            _ => break, // unknown future version — stop; import_config rejects these
        }
        cfg.schema_version += 1;
    }
}

/// Bring the alert settings into a legal shape: clamp `notify_volume` to `0..=100`, catching a
/// hand-edited or imported `101..=255`. Runs on load, on import, and on every settings write.
///
/// `notify_volume` and the three `*_sound` flags are **independent** (ADR-0028): volume `0` mutes
/// the audio and leaves the flags alone, so `{notify_volume: 0, blocked_sound: true}` is a legal
/// state. It stays honest because the frontend never reads a `*_sound` flag as "audible" on its
/// own — `alerts.ts::soundAudible` is the single predicate for that, and it is what
/// `effectiveDir` / `fireBatch` consult, so a muted channel cannot outrank a channel the user
/// can actually perceive (the ADR-0023 guarantee). Earlier this file cleared the flags at
/// volume 0 to reach the same end; that made the volume destroy configuration (ADR-0026).
pub fn normalize_alerts(cfg: &mut Config) {
    cfg.notify_volume = models::clamp_volume(cfg.notify_volume);
}

/// Is `host` something a probe can connect to: a DNS name, an IPv4 address, or a `*.`-prefixed
/// wildcard (ADR-0020)? No scheme, path, port, whitespace or IPv6 — those belong in other fields
/// or aren't supported. The one rule for hosts; `validate` and the edit commands both call it.
pub fn validate_endpoint(host: &str, port: u16) -> Result<(), String> {
    let name = host.strip_prefix("*.").unwrap_or(host);
    let ok = !name.is_empty()
        && name.split('.').all(|label| {
            !label.is_empty() && label.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        });
    if !ok {
        return Err(format!("\"{host}\" isn't a valid host name."));
    }
    if port == 0 {
        return Err(format!("Port 0 isn't valid for {host}."));
    }
    Ok(())
}

/// Structural invariants every config must hold before it replaces the live one: unique ids
/// (reorder, collapse and deltas address items by id), at least one endpoint per service, and
/// valid endpoints.
pub fn validate(cfg: &Config) -> Result<(), String> {
    let mut ids = HashSet::new();
    let mut unique = |id: &str| -> Result<(), String> {
        if ids.insert(id.to_string()) {
            Ok(())
        } else {
            Err(format!("Duplicate id \"{id}\" in the config."))
        }
    };
    for list in &cfg.lists {
        unique(&list.id)?;
        for svc in &list.services {
            unique(&svc.id)?;
            if svc.endpoints.is_empty() {
                return Err(format!("\"{}\" in {} has no endpoints.", svc.label, list.name));
            }
            for ep in &svc.endpoints {
                unique(&ep.id)?;
                validate_endpoint(&ep.host, ep.port)?;
            }
        }
    }
    Ok(())
}

/// Write config to `path` atomically, creating parent dirs as needed. Pretty-printed for
/// hand-editing. Writes a sibling tmp file, fsyncs it, then renames it over `path`, so a crash or
/// full disk mid-write leaves the previous file intact instead of a truncated one.
pub fn save(path: &Path, config: &Config) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config).expect("config serializes");
    let tmp = path.with_extension("json.tmp");
    let mut file = fs::File::create(&tmp)?;
    file.write_all(json.as_bytes())?;
    file.sync_all()?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CURRENT_SCHEMA;

    /// Saving then loading yields an equivalent config, including schema_version.
    #[test]
    fn round_trip() {
        let dir = std::env::temp_dir().join(format!("qanary-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join("config.json");

        let original = Config::default();
        save(&path, &original).expect("save");
        let (loaded, warning) = load(&path);
        assert!(warning.is_none());

        assert_eq!(loaded.lists.len(), original.lists.len());
        assert_eq!(loaded.critical_interval_secs, original.critical_interval_secs);
        assert_eq!(loaded.noncritical_interval_secs, original.noncritical_interval_secs);
        assert_eq!(loaded.lists[0].services.len(), original.lists[0].services.len());
        // Every service must survive round-trip with at least one endpoint.
        for svc in &loaded.lists[0].services {
            assert!(!svc.endpoints.is_empty());
        }
        assert_eq!(loaded.ip_providers.len(), original.ip_providers.len());
        // schema_version must survive the round-trip intact.
        assert_eq!(loaded.schema_version, original.schema_version);

        fs::remove_dir_all(&dir).ok();
    }

    /// Legacy `{host, port}` JSON (schema_version = 0 by default) is migrated to
    /// `endpoints` on load and ends up at CURRENT_SCHEMA.
    #[test]
    fn migrate_legacy_host_port() {
        let dir = std::env::temp_dir().join(format!("qanary-migrate-{}", uuid::Uuid::new_v4()));
        let path = dir.join("config.json");

        // Write old-style JSON with `host` and `port` at the service level, no `endpoints`,
        // and no `schema_version` (serde default → 0, which triggers step 0→1).
        let legacy_json = r#"{
            "lists": [{
                "id": "l1",
                "name": "Test",
                "icon": "",
                "collapsed": false,
                "services": [{
                    "id": "s1",
                    "label": "Example",
                    "host": "example.com",
                    "port": 443,
                    "enabled": true
                }]
            }],
            "probe_interval_secs": 30,
            "timeout_ms": 3000,
            "ip_providers": []
        }"#;
        fs::create_dir_all(&dir).unwrap();
        fs::write(&path, legacy_json).unwrap();

        let (cfg, _) = load(&path);
        let svc = &cfg.lists[0].services[0];
        assert_eq!(svc.label, "Example");
        assert_eq!(svc.endpoints.len(), 1, "legacy host should be folded into one endpoint");
        assert_eq!(svc.endpoints[0].host, "example.com");
        assert_eq!(svc.endpoints[0].port, 443);
        // After migration, schema_version must be stamped to the current version.
        assert_eq!(cfg.schema_version, CURRENT_SCHEMA, "migrated config should reach CURRENT_SCHEMA");

        fs::remove_dir_all(&dir).ok();
    }

    /// A config without schema_version (old file) loads and ends up at CURRENT_SCHEMA.
    #[test]
    fn no_schema_version_migrates_to_current() {
        let dir = std::env::temp_dir().join(format!("qanary-noschema-{}", uuid::Uuid::new_v4()));
        let path = dir.join("config.json");

        // Minimal valid config with no schema_version field — simulates a pre-versioning save.
        let json = r#"{"lists":[],"timeout_ms":3000,"ip_providers":[]}"#;
        fs::create_dir_all(&dir).unwrap();
        fs::write(&path, json).unwrap();

        let (cfg, _) = load(&path);
        assert_eq!(cfg.schema_version, CURRENT_SCHEMA);

        fs::remove_dir_all(&dir).ok();
    }

    /// `migrate` rejects schema_version values above CURRENT_SCHEMA (stops at the unknown arm).
    /// The runner must NOT infinite-loop on a future version.
    #[test]
    fn migrate_stops_on_unknown_version() {
        let mut cfg = Config::default();
        cfg.schema_version = CURRENT_SCHEMA + 5; // simulate a newer-app config
        migrate(&mut cfg);
        // Must still be above CURRENT_SCHEMA — the _ arm breaks without touching it.
        assert!(cfg.schema_version > CURRENT_SCHEMA);
    }

    /// `clamp_volume` clamps to 0..=100; step is 1, so in-range values pass through unchanged.
    #[test]
    fn clamp_volume_clamps_to_0_100() {
        use crate::models::clamp_volume;
        assert_eq!(clamp_volume(0), 0);
        assert_eq!(clamp_volume(1), 1);
        assert_eq!(clamp_volume(37), 37);
        assert_eq!(clamp_volume(100), 100);
        // Out of range (hand-edited) values clamp down to 100 rather than wrapping.
        assert_eq!(clamp_volume(101), 100);
        assert_eq!(clamp_volume(255), 100);
    }

    /// Volume 0 is a mute, not a reset: the three `*_sound` flags survive it, so raising the
    /// volume again restores exactly the directions the user had configured (ADR-0028).
    #[test]
    fn normalize_alerts_zero_volume_keeps_sound_flags() {
        let mut cfg = Config::default();
        cfg.notify_volume = 0;
        cfg.down_sound = true;
        cfg.up_sound = true;
        cfg.blocked_sound = true;

        normalize_alerts(&mut cfg);

        assert_eq!(cfg.notify_volume, 0);
        assert!(cfg.down_sound);
        assert!(cfg.up_sound);
        assert!(cfg.blocked_sound);
    }

    /// An out-of-range volume is clamped, and the sound flags are never touched.
    #[test]
    fn normalize_alerts_clamps_without_touching_flags() {
        let mut cfg = Config::default();
        cfg.notify_volume = 137;
        cfg.down_sound = true;

        normalize_alerts(&mut cfg);

        assert_eq!(cfg.notify_volume, 100);
        assert!(cfg.down_sound, "clamping must not change the flags");
    }

    /// All flags off does NOT lower the stored volume, so the user's remembered level survives
    /// turning every sound alert off and back on.
    #[test]
    fn normalize_alerts_keeps_volume_when_all_flags_off() {
        let mut cfg = Config::default();
        cfg.notify_volume = 100;
        cfg.down_sound = false;
        cfg.up_sound = false;
        cfg.blocked_sound = false;

        normalize_alerts(&mut cfg);

        assert_eq!(cfg.notify_volume, 100);
    }

    /// A saved out-of-range volume is clamped when the config is loaded from disk.
    #[test]
    fn load_clamps_stored_volume() {
        let dir = std::env::temp_dir().join(format!("qanary-volume-{}", uuid::Uuid::new_v4()));
        let path = dir.join("config.json");

        let mut original = Config::default();
        original.notify_volume = 137;
        save(&path, &original).expect("save");

        assert_eq!(load(&path).0.notify_volume, 100);

        fs::remove_dir_all(&dir).ok();
    }

    /// Missing file → seeded defaults (two lists: Global + Iran).
    #[test]
    fn missing_file_seeds_defaults() {
        let path = std::env::temp_dir().join("qanary-does-not-exist-xyz/config.json");
        let (cfg, _) = load(&path);
        assert_eq!(cfg.lists.len(), 2);
        assert_eq!(cfg.lists[0].name, "Global");
        assert_eq!(cfg.lists[1].name, "Iran");
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("qanary-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn backups(dir: &Path) -> Vec<std::path::PathBuf> {
        fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().contains("config.json.bad-"))
            .collect()
    }

    /// A corrupt file is moved aside byte-for-byte before defaults are used, so the save that
    /// follows at startup (`take_new_changelog`) can't destroy it (A02).
    #[test]
    fn corrupt_file_is_quarantined_not_overwritten() {
        let dir = temp_dir("corrupt");
        let path = dir.join("config.json");
        let original = r#"{"lists": [ {"id": "l1", "#;
        fs::write(&path, original).unwrap();

        let (cfg, warning) = load(&path);
        assert_eq!(cfg.lists.len(), Config::default().lists.len(), "falls back to defaults");
        assert!(warning.is_some(), "user is told");
        save(&path, &cfg).unwrap(); // what startup does next

        let kept = backups(&dir);
        assert_eq!(kept.len(), 1);
        assert_eq!(fs::read_to_string(&kept[0]).unwrap(), original);
        fs::remove_dir_all(&dir).ok();
    }

    /// A newer app's config is kept aside too: re-saving it would drop the fields we don't know.
    #[test]
    fn future_schema_is_quarantined() {
        let dir = temp_dir("future");
        let path = dir.join("config.json");
        let mut newer = Config::default();
        newer.schema_version = CURRENT_SCHEMA + 1;
        save(&path, &newer).unwrap();

        let (cfg, warning) = load(&path);
        assert_eq!(cfg.schema_version, CURRENT_SCHEMA);
        assert!(warning.unwrap().contains("newer version"));
        assert_eq!(backups(&dir).len(), 1);
        assert!(!path.exists());
        fs::remove_dir_all(&dir).ok();
    }

    /// Atomic save leaves exactly the target file behind — no stray tmp file.
    #[test]
    fn save_leaves_no_tmp_file() {
        let dir = temp_dir("atomic");
        let path = dir.join("config.json");
        save(&path, &Config::default()).unwrap();
        save(&path, &Config::default()).unwrap();
        let names: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("config.json")]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn default_config_is_valid() {
        validate(&Config::default()).unwrap();
    }

    #[test]
    fn validate_endpoint_accepts_hosts_ips_and_wildcards() {
        for host in ["google.com", "1.1.1.1", "*.api5.cursor.sh", "localhost", "my_host.lan"] {
            validate_endpoint(host, 443).unwrap_or_else(|e| panic!("{host}: {e}"));
        }
    }

    #[test]
    fn validate_endpoint_rejects_non_hosts() {
        // "google.com: google.com" is what the A01 edit bug stored.
        for host in [
            "", "google.com: google.com", "x.com/status", "https://x.com", "x.com:443",
            "[::1]", "::1", "a..b", "*.", "a b",
        ] {
            assert!(validate_endpoint(host, 443).is_err(), "{host:?} should be rejected");
        }
        assert!(validate_endpoint("x.com", 0).is_err(), "port 0");
    }

    #[test]
    fn validate_rejects_duplicate_ids_and_empty_services() {
        let mut dup = Config::default();
        let copy = dup.lists[0].clone();
        dup.lists.push(copy);
        assert!(validate(&dup).unwrap_err().contains("Duplicate id"));

        let mut empty = Config::default();
        empty.lists[0].services[0].endpoints.clear();
        assert!(validate(&empty).unwrap_err().contains("no endpoints"));
    }

    fn one_service(label: &str, hosts: &[(&str, u16)]) -> Config {
        let mut cfg = Config::default();
        cfg.lists.truncate(1);
        cfg.lists[0].services = vec![crate::models::Service::with_endpoints(
            label,
            hosts.iter().map(|(h, p)| Endpoint::new(h, *p)).collect(),
        )];
        cfg
    }

    /// The common A01 case: bare host `google.com`, edited once or twice.
    #[test]
    fn repair_restores_bare_host_and_label() {
        for damaged in ["google.com: google.com", "google.com: google.com: google.com"] {
            let mut cfg = one_service(damaged, &[(damaged, 443)]);
            assert_eq!(repair_legacy_hosts(&mut cfg), 1);
            let svc = &cfg.lists[0].services[0];
            assert_eq!(svc.label, "google.com");
            assert_eq!(svc.endpoints[0].host, "google.com");
            validate(&cfg).unwrap();
        }
    }

    /// A non-443 port was folded into the damaged host and replaced by 443; it comes back.
    #[test]
    fn repair_recovers_port() {
        let damaged = "api.x.com: api.x.com:8443";
        let mut cfg = one_service(damaged, &[(damaged, 443), ("b.com", 443)]);
        assert_eq!(repair_legacy_hosts(&mut cfg), 1);
        let svc = &cfg.lists[0].services[0];
        assert_eq!((svc.endpoints[0].host.as_str(), svc.endpoints[0].port), ("api.x.com", 8443));
        assert_eq!(svc.endpoints[1].host, "b.com", "healthy endpoints untouched");
        assert_eq!(svc.label, "api.x.com");
    }

    /// The old URL parser kept paths (`x.com/inbox`); load tolerated it, export wrote it, and the
    /// strict import then refused the app's own export.
    #[test]
    fn repair_drops_a_pasted_url_path() {
        for (damaged, port) in [("x.com/inbox", 443), ("x.com/a?b#c", 443), ("x.com/inbox", 8080)] {
            let mut cfg = one_service("X", &[(damaged, port), ("b.com", 443)]);
            assert_eq!(repair_legacy_hosts(&mut cfg), 1);
            let ep = &cfg.lists[0].services[0].endpoints[0];
            assert_eq!((ep.host.as_str(), ep.port), ("x.com", port));
            validate(&cfg).unwrap();
        }
        let a01_with_path = "x.com/inbox: x.com/inbox";
        let mut cfg = one_service(a01_with_path, &[(a01_with_path, 443)]);
        assert_eq!(repair_legacy_hosts(&mut cfg), 1);
        assert_eq!(cfg.lists[0].services[0].endpoints[0].host, "x.com");
    }

    /// A label the user chose with a colon, on a healthy service, is not the bug's fingerprint.
    #[test]
    fn repair_leaves_healthy_services_alone() {
        let mut cfg = one_service("Work: VPN", &[("vpn.corp.com", 443)]);
        assert_eq!(repair_legacy_hosts(&mut cfg), 0);
        assert_eq!(cfg.lists[0].services[0].label, "Work: VPN");
        assert_eq!(repair_legacy_hosts(&mut Config::default()), 0);
    }

    /// Load repairs and persists, so the fix survives a restart without any other write.
    #[test]
    fn load_persists_repair() {
        let dir = temp_dir("repair");
        let path = dir.join("config.json");
        let damaged = "x.com: x.com";
        save(&path, &one_service(damaged, &[(damaged, 443)])).unwrap();

        let (cfg, warning) = load(&path);
        assert!(warning.is_none());
        assert_eq!(cfg.lists[0].services[0].endpoints[0].host, "x.com");
        assert!(!fs::read_to_string(&path).unwrap().contains(damaged), "saved back");
        fs::remove_dir_all(&dir).ok();
    }
}
