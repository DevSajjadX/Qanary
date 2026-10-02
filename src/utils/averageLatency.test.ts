import { describe, expect, it } from "vitest";
import type { EndpointStatus, ServiceState } from "../types";
import { averageLatency, averageLatencyTitle } from "./averageLatency";

const ep = (state: ServiceState, latency_ms: number | null, id = "e"): EndpointStatus => ({
  id,
  host: "h",
  state,
  latency_ms,
});

describe("averageLatency", () => {
  it("is the rounded mean of the hosts that are up, with the spread", () => {
    expect(averageLatency([ep("up", 30), ep("up", 32), ep("up", 200)])).toEqual({
      mean: 87, // 87.33
      min: 30,
      max: 200,
      n: 3,
    });
  });

  it("ignores hosts that are down, blocked, reachable (TCP only) or still checking", () => {
    const s = averageLatency([
      ep("up", 40),
      ep("up", 60),
      ep("down", null),
      ep("blocked", 15), // blocked reports a TCP time, which is not a full-path latency
      ep("reachable", 5),
      ep("checking", null),
    ]);
    expect(s).toEqual({ mean: 50, min: 40, max: 60, n: 2 });
  });

  it("is null when nothing qualifies, so nothing is shown", () => {
    expect(averageLatency([])).toBeNull();
    expect(averageLatency([ep("down", null), ep("blocked", 20), ep("checking", null)])).toBeNull();
    expect(averageLatency([ep("up", null)])).toBeNull(); // up without a number
  });

  it("works for a single host", () => {
    expect(averageLatency([ep("up", 25), ep("down", null)])).toEqual({ mean: 25, min: 25, max: 25, n: 1 });
  });
});

describe("averageLatencyTitle", () => {
  it("says what the figure is over and the spread", () => {
    const s = { mean: 45, min: 30, max: 60, n: 3 };
    expect(averageLatencyTitle(s, 3)).toBe("Average of all 3 hosts that answered · fastest 30 ms · slowest 60 ms");
    expect(averageLatencyTitle(s, 5)).toBe("Average of 3 of 5 hosts that answered · fastest 30 ms · slowest 60 ms");
    expect(averageLatencyTitle({ mean: 25, min: 25, max: 25, n: 1 }, 4)).toBe("Only 1 of 4 hosts answered: 25 ms");
  });
});
