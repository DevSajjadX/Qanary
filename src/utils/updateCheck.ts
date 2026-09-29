import type { UpdatePhase } from "../App";

export interface UpdateState {
  phase: UpdatePhase | null;
  version: string | null;
}

export interface UpdateInfo {
  version: string;
}

/**
 * Pure supersede rule: given the current update UI state and fresh info from the updater,
 * return the next state.
 *
 * - null info → no change (up-to-date, keep whatever phase/version we have)
 * - downloading/ready → no change, even for a newer version: the handle on disk is the one that
 *   installs (update.ts pins it); the newer release is found after relaunch (audit A12)
 * - newer version → "available"
 * - same version → no change
 */
export function nextUpdatePhase(
  current: UpdateState,
  info: UpdateInfo | null,
): UpdateState {
  if (!info) return current;
  if (current.phase === "downloading" || current.phase === "ready") return current;
  if (info.version !== current.version) return { phase: "available", version: info.version };
  return current;
}
