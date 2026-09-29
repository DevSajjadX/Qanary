import { describe, it, expect } from "vitest";
import { nextUpdatePhase, type UpdateState } from "./updateCheck";

const none = (): UpdateState => ({ phase: null, version: null });
const available = (v: string): UpdateState => ({ phase: "available", version: v });
const downloading = (v: string): UpdateState => ({ phase: "downloading", version: v });
const ready = (v: string): UpdateState => ({ phase: "ready", version: v });

describe("nextUpdatePhase", () => {
  it("null info → unchanged (up-to-date re-check)", () => {
    expect(nextUpdatePhase(available("1.0.1"), null)).toEqual(available("1.0.1"));
    expect(nextUpdatePhase(none(), null)).toEqual(none());
  });

  it("newer version → available", () => {
    expect(nextUpdatePhase(none(), { version: "1.0.1" })).toEqual(available("1.0.1"));
    expect(nextUpdatePhase(available("1.0.1"), { version: "1.0.2" })).toEqual(available("1.0.2"));
  });

  // A12: the old rule reset `ready` to `available` for the newer version while update.ts still
  // held the downloaded handle, so "Update" re-downloaded or installed the wrong one.
  it("newer version while downloading or ready → no change (install what's on disk)", () => {
    expect(nextUpdatePhase(ready("1.0.1"), { version: "1.0.2" })).toEqual(ready("1.0.1"));
    expect(nextUpdatePhase(downloading("1.0.1"), { version: "1.0.2" })).toEqual(
      downloading("1.0.1"),
    );
  });

  it("same version while downloading → no change (let it finish)", () => {
    const current = downloading("1.0.1");
    expect(nextUpdatePhase(current, { version: "1.0.1" })).toEqual(current);
  });

  it("same version while ready → no change (install still valid)", () => {
    const current = ready("1.0.1");
    expect(nextUpdatePhase(current, { version: "1.0.1" })).toEqual(current);
  });

  it("same version while available → no change", () => {
    const current = available("1.0.1");
    expect(nextUpdatePhase(current, { version: "1.0.1" })).toEqual(current);
  });
});
