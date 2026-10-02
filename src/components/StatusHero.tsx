import React, { useEffect, useRef } from "react";
import type { Severity, Snapshot } from "../types";
import type { UpdatePhase } from "../App";
import { Canary } from "./Canary";
import { Icon } from "./Icon";
import { OrbIcon, type Mood } from "./orbIcons";
import { useOrbStyle } from "../orbStyle";

// Calm vs urgent microcopy, keyed by Severity. One place so tone stays
// consistent (and is easy to localize later).
function severityCopy(
  snapshot: Snapshot | null,
  overall: Severity,
  failingList: string | null,
  cutOff: boolean,
): { head: string; sub: string } {
  // Nothing measured yet is not "All clear" (audit B07).
  const services = snapshot?.lists.flatMap((l) => l.services) ?? null;
  if (snapshot?.lists.length === 0)
    return { head: "Nothing to watch", sub: "Add a list to start monitoring." };
  if (services?.length === 0)
    return { head: "Nothing to watch", sub: "Add a service to start monitoring." };
  if (!services || services.every((s) => s.state === "checking"))
    return { head: "Checking…", sub: "Checking your services." };
  if (cutOff)
    return {
      head: "You're offline",
      sub: "Can't reach anything — check your connection.",
    };
  if (overall === "green")
    return { head: "All clear", sub: "Everything’s reachable." };
  if (overall === "yellow")
    return {
      head: "Heads up",
      sub: failingList
        ? `${failingList} is fully unreachable.`
        : "A list is fully unreachable.",
    };
  return {
    head: "Something’s wrong",
    sub: failingList
      ? `${failingList} is fully unreachable.`
      : "Some services are unreachable.",
  };
}

function moodOf(
  snapshot: Snapshot | null,
  overall: Severity,
  busy: boolean,
  cutOff: boolean,
): Mood {
  if (busy) return "busy"; // refreshing: gray, rings pulse
  const services = snapshot?.lists.flatMap((l) => l.services) ?? [];
  if (services.length === 0) return "idle"; // nothing to watch
  if (cutOff) return "offline";
  return overall === "green" ? "ok" : overall === "yellow" ? "warn" : "alarm";
}

/** The status orb — status badge + refresh button in one.
 *  The mood is drawn in the user's chosen style (Rings or Pulse); hover swaps it for a
 *  refresh arrow. Busy: gray, the icon pulses and ripples go outward. */
function StatusOrb({
  mood,
  busy,
  heroRef,
  onClick,
}: {
  mood: Mood;
  busy: boolean;
  heroRef: React.RefObject<HTMLElement | null>;
  onClick: () => void;
}) {
  const orbRef = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  const [orbStyle] = useOrbStyle();

  // A mood change lands with a pop + ripple (+ a shake for the two alarms), and the
  // headline recoils. Classes are removed again so the next change can replay them.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const orb = orbRef.current;
    const hero = heroRef.current;
    if (!orb) return;
    const orbCls = ["orb-pop", "orb-ring", "orb-flash"];
    if (mood === "alarm" || mood === "offline") orbCls.push("orb-shake");
    orb.classList.remove("orb-pop", "orb-ring", "orb-flash", "orb-shake");
    hero?.classList.remove("hero-recoil");
    void orb.offsetWidth; // restart the animations
    orb.classList.add(...orbCls);
    hero?.classList.add("hero-recoil");
    const t = setTimeout(() => {
      orb.classList.remove("orb-pop", "orb-ring", "orb-flash", "orb-shake");
      hero?.classList.remove("hero-recoil");
    }, 1300);
    return () => clearTimeout(t);
  }, [mood, heroRef]);

  return (
    <div className="orb-wrap">
      <span className="orb-glow" aria-hidden="true" />
      <button
        ref={orbRef}
        className={`status-orb${busy ? " status-orb-busy" : ""}`}
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        title="Refresh now"
        aria-label="Refresh"
      >
        <OrbIcon key={`${orbStyle}-${mood}`} style={orbStyle} mood={mood} />
        <span className="orb-refresh" aria-hidden="true">
          <Icon name="restart" size={32} strokeWidth={3.2} />
        </span>
      </button>
    </div>
  );
}

export function StatusHero({
  snapshot,
  onRefresh,
  onOpenSettings,
  updatePhase,
  downloadProgress,
  onDownload,
  onInstall,
}: {
  snapshot: Snapshot | null;
  onRefresh: () => Promise<void>;
  onOpenSettings: () => void;
  updatePhase: UpdatePhase | null;
  downloadProgress: number;
  onDownload: () => void;
  onInstall: () => void;
}) {
  const overall: Severity = snapshot?.overall ?? "green";
  const cutOff = snapshot?.cut_off ?? false;
  const wan = snapshot?.wan ?? null;
  const failingList = snapshot?.lists.find((l) => l.all_down)?.name ?? null;
  const copy = severityCopy(snapshot, overall, failingList, cutOff);

  // Gray + pulse while a round of probes is in flight (startup, refresh, a network change). That is
  // exactly an unsettled snapshot. Re-checking one site by clicking its name marks only that row
  // Checking and leaves the snapshot settled, so the hero keeps its real status meanwhile.
  const busy = snapshot === null || !snapshot.settled;
  const mood = moodOf(snapshot, overall, busy, cutOff);
  const heroRef = useRef<HTMLElement>(null);

  return (
    <header ref={heroRef} className={`hero hero-${mood}`}>
      <div className="hero-bar">
        <div className="hero-brand">
          <span className="logo-mark">
            <Canary size={34} />
          </span>
          <span className="hero-brand-name">Qanary</span>
        </div>
        <button
          className="hero-gear"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="settings" size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className="hero-main">
        <div className="hero-copy">
          <div className="hero-headline">{copy.head}</div>
          <div className="hero-sub">{copy.sub}</div>

          <div className="hero-footer">
            <div
              className="wan"
              title={
                wan ? `${wan.country_name} (${wan.country_code})` : "WAN unknown"
              }
            >
              {wan ? (
                <>
                  <span className="flag">{wan.flag_emoji || "🏳️"}</span>
                  <span className="wan-cc">{wan.country_code || "??"}</span>
                  <i className="wan-sep" aria-hidden="true" />
                  <span className="wan-ip">{wan.ip}</span>
                </>
              ) : (
                <span className="wan-ip">—</span>
              )}
            </div>

            {updatePhase === "available" && (
              <button className="update-btn" data-phase="available" onClick={onDownload}>
                <Icon name="download" size={15} strokeWidth={3.3} />
                <span className="update-btn-text">Update</span>
              </button>
            )}
            {updatePhase === "downloading" && (
              <button
                className="update-btn"
                data-phase="downloading"
                disabled
                style={{ "--pct": `${downloadProgress}%` } as React.CSSProperties}
              >
                <span className="update-btn-text">Downloading…</span>
              </button>
            )}
            {updatePhase === "ready" && (
              <button className="update-btn" data-phase="ready" onClick={onInstall}>
                <Icon name="restart" size={15} strokeWidth={3.2} />
                <span className="update-btn-text">Restart</span>
              </button>
            )}
          </div>
        </div>

        <StatusOrb mood={mood} busy={busy} heroRef={heroRef} onClick={onRefresh} />
      </div>
    </header>
  );
}
