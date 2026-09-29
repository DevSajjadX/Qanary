import { describe, it, expect } from "vitest";
import { endpointsToText, parseEndpoints, parseServiceLines } from "./parseServices";

const drafts = (text: string) => parseServiceLines(text).drafts;

describe("parseServiceLines", () => {
  it("bare hostname → label = host, one endpoint", () => {
    expect(drafts("google.com")).toEqual([
      { label: "google.com", endpoints: [{ host: "google.com" }] },
    ]);
  });

  it("label: host syntax", () => {
    expect(drafts("Google: google.com")).toEqual([
      { label: "Google", endpoints: [{ host: "google.com" }] },
    ]);
  });

  it("multiple hosts, comma-separated", () => {
    expect(drafts("CDN: a.com, b.com")).toEqual([
      { label: "CDN", endpoints: [{ host: "a.com" }, { host: "b.com" }] },
    ]);
  });

  it("host with port parsed", () => {
    expect(drafts("api.com:8080")).toEqual([
      { label: "api.com", endpoints: [{ host: "api.com", port: 8080 }] },
    ]);
  });

  it("label with port in host", () => {
    expect(drafts("API: api.com:9000")).toEqual([
      { label: "API", endpoints: [{ host: "api.com", port: 9000 }] },
    ]);
  });

  it("blank lines ignored", () => {
    expect(drafts("\ngoogle.com\n\nexample.com\n")).toEqual([
      { label: "google.com", endpoints: [{ host: "google.com" }] },
      { label: "example.com", endpoints: [{ host: "example.com" }] },
    ]);
  });

  it("empty string → nothing, nothing invalid", () => {
    expect(parseServiceLines("")).toEqual({ drafts: [], invalid: [] });
  });

  it("a pasted URL is a host, never a label named after its scheme", () => {
    expect(drafts("https://x.com:8443/status?a#b")).toEqual([
      { label: "x.com", endpoints: [{ host: "x.com", port: 8443 }] },
    ]);
    expect(drafts("X: https://x.com/home")).toEqual([
      { label: "X", endpoints: [{ host: "x.com" }] },
    ]);
  });

  it("label with dot not mistaken for label separator", () => {
    expect(drafts("docs.google.com")).toEqual([
      { label: "docs.google.com", endpoints: [{ host: "docs.google.com" }] },
    ]);
  });

  it("lines it can't read are reported, and nothing from them is added", () => {
    expect(parseServiceLines("good.com\nLocal: [::1]:8443\nOther: a.com, ::1\nEmpty:")).toEqual({
      drafts: [{ label: "good.com", endpoints: [{ host: "good.com" }] }],
      invalid: ["Local: [::1]:8443", "Other: a.com, ::1", "Empty:"],
    });
  });
});

describe("parseEndpoints / endpointsToText", () => {
  const eps = (list: { host: string; port: number }[]) =>
    list.map((e, i) => ({ id: String(i), ...e }));

  it("round-trips hosts, wildcards and explicit ports", () => {
    const stored = eps([
      { host: "google.com", port: 443 },
      { host: "*.cursor.sh", port: 443 },
      { host: "api.com", port: 8080 },
    ]);
    const text = endpointsToText(stored);
    expect(text).toBe("google.com, *.cursor.sh, api.com:8080");
    expect(parseEndpoints(text)).toEqual({
      endpoints: [{ host: "google.com" }, { host: "*.cursor.sh" }, { host: "api.com", port: 8080 }],
      invalid: [],
    });
  });

  // The A01 regression: a bare host must survive Edit → Save untouched.
  it("a bare host round-trips unchanged", () => {
    expect(parseEndpoints(endpointsToText(eps([{ host: "google.com", port: 443 }])))).toEqual({
      endpoints: [{ host: "google.com" }],
      invalid: [],
    });
  });

  it("reports the endpoints it can't read", () => {
    expect(parseEndpoints("a.com, [::1], b.com:0")).toEqual({
      endpoints: [{ host: "a.com" }],
      invalid: ["[::1]", "b.com:0"],
    });
  });
});
