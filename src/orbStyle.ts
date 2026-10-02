// The status orb can draw its mood two ways — concentric "Rings" (default) or a "Pulse"
// heartbeat trace. The choice is a per-device preference like the theme: localStorage, no
// backend. The hero and Settings both read it, so it lives in a tiny external store
// (useSyncExternalStore) rather than in either component's state.
import { useSyncExternalStore } from "react";

export type OrbStyle = "rings" | "pulse";

const KEY = "qanary-orb-style";

function load(): OrbStyle {
  try {
    return localStorage.getItem(KEY) === "pulse" ? "pulse" : "rings";
  } catch {
    return "rings"; // storage can be unavailable (private mode, blocked): fall back quietly
  }
}

let current: OrbStyle = load();
const listeners = new Set<() => void>();

export function getOrbStyle(): OrbStyle {
  return current;
}

export function setOrbStyle(style: OrbStyle): void {
  if (style === current) return;
  current = style;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    /* keep the choice for this session even if it can't be saved */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOrbStyle(): [OrbStyle, (style: OrbStyle) => void] {
  return [useSyncExternalStore(subscribe, getOrbStyle), setOrbStyle];
}
