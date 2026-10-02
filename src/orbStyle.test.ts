import { describe, it, expect, beforeEach, vi } from "vitest";

// The store reads localStorage once at import, so each test imports a fresh copy.
async function fresh() {
  vi.resetModules();
  return import("./orbStyle");
}

beforeEach(() => {
  localStorage.clear();
});

describe("orbStyle", () => {
  it("defaults to rings", async () => {
    const { getOrbStyle } = await fresh();
    expect(getOrbStyle()).toBe("rings");
  });

  it("restores a saved Pulse choice", async () => {
    localStorage.setItem("qanary-orb-style", "pulse");
    const { getOrbStyle } = await fresh();
    expect(getOrbStyle()).toBe("pulse");
  });

  it("treats anything unknown as rings", async () => {
    localStorage.setItem("qanary-orb-style", "sparkles");
    const { getOrbStyle } = await fresh();
    expect(getOrbStyle()).toBe("rings");
  });

  it("setOrbStyle saves the choice and tells subscribers", async () => {
    const { setOrbStyle, getOrbStyle } = await fresh();
    setOrbStyle("pulse");
    expect(getOrbStyle()).toBe("pulse");
    expect(localStorage.getItem("qanary-orb-style")).toBe("pulse");
  });

  it("still switches for the session when storage refuses the write", async () => {
    const { setOrbStyle, getOrbStyle } = await fresh();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setOrbStyle("pulse")).not.toThrow();
    expect(getOrbStyle()).toBe("pulse");
    spy.mockRestore();
  });
});
