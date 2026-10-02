import type { EndpointStatus } from "../types";

export interface LatencySummary {
  /** Mean latency in whole ms. */
  mean: number;
  min: number;
  max: number;
  /** How many hosts the figures are over. */
  n: number;
}

/**
 * The speed of a group of hosts at a glance: the mean latency of the ones that answered.
 *
 * Only `up` hosts count — they alone carry a full-path latency. Down and Blocked have none to
 * speak of, a wildcard's TCP-only `reachable` is not comparable, and `checking` has no result yet.
 * `null` when none qualifies, so the caller shows nothing rather than a made-up number.
 */
export function averageLatency(endpoints: EndpointStatus[]): LatencySummary | null {
  const ms = endpoints
    .filter((e) => e.state === "up" && e.latency_ms != null)
    .map((e) => e.latency_ms as number);
  if (ms.length === 0) return null;
  return {
    mean: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
    min: Math.min(...ms),
    max: Math.max(...ms),
    n: ms.length,
  };
}

/** Tooltip for the "~45 ms" figure: what it is an average of, and the spread it hides. */
export function averageLatencyTitle(s: LatencySummary, total: number): string {
  if (s.n === 1) return `Only 1 of ${total} hosts answered: ${s.mean} ms`;
  const of = s.n === total ? `all ${total} hosts` : `${s.n} of ${total} hosts`;
  return `Average of ${of} that answered · fastest ${s.min} ms · slowest ${s.max} ms`;
}
