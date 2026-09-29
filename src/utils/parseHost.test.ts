import { describe, it, expect } from "vitest";
import { parseHost, splitHostPort } from "./parseHost";

describe("parseHost", () => {
  it("strips https scheme", () => {
    expect(parseHost("https://google.com")).toBe("google.com");
  });

  it("strips http scheme (case-insensitive)", () => {
    expect(parseHost("HTTP://Google.com")).toBe("Google.com");
  });

  it("strips www.", () => {
    expect(parseHost("www.google.com")).toBe("google.com");
  });

  it("preserves subdomain other than www", () => {
    expect(parseHost("docs.google.com")).toBe("docs.google.com");
  });

  it("preserves wildcard host prefix (resolved at probe time)", () => {
    expect(parseHost("*.google.com")).toBe("*.google.com");
  });

  it("strips wildcard path", () => {
    expect(parseHost("google.com/*")).toBe("google.com");
  });

  it("strips trailing slash", () => {
    expect(parseHost("google.com/")).toBe("google.com");
  });

  it("preserves non-wildcard path", () => {
    expect(parseHost("google.com/inbox")).toBe("google.com/inbox");
  });

  it("extracts URL from markdown link", () => {
    expect(parseHost("[Google](https://google.com/)")).toBe("google.com");
  });

  it("handles markdown link where URL differs from label", () => {
    expect(parseHost("[text](https://www.example.com/)")).toBe("example.com");
  });

  it("handles plain hostname already clean", () => {
    expect(parseHost("  api.example.com  ")).toBe("api.example.com");
  });
});

describe("splitHostPort", () => {
  it("no port → host only", () => {
    expect(splitHostPort("google.com")).toEqual({ host: "google.com" });
  });

  it("valid port extracted", () => {
    expect(splitHostPort("google.com:8080")).toEqual({ host: "google.com", port: 8080 });
  });

  it("port 65535 is valid", () => {
    expect(splitHostPort("google.com:65535")).toEqual({ host: "google.com", port: 65535 });
  });

  // An out-of-range port is a typo, not a request for 443.
  it("port 0 or 65536 → invalid", () => {
    expect(splitHostPort("google.com:0")).toBeNull();
    expect(splitHostPort("google.com:65536")).toBeNull();
  });

  it("strips scheme before port split", () => {
    expect(splitHostPort("https://api.example.com:9000")).toEqual({
      host: "api.example.com",
      port: 9000,
    });
  });

  it("drops path, query and fragment from a pasted URL", () => {
    expect(splitHostPort("https://x.com:8443/status?a=1#top")).toEqual({ host: "x.com", port: 8443 });
    expect(splitHostPort("x.com/inbox")).toEqual({ host: "x.com" });
  });

  it("keeps wildcards", () => {
    expect(splitHostPort("*.cursor.sh")).toEqual({ host: "*.cursor.sh" });
  });

  // IPv6 isn't supported by the probe yet: reject rather than store a mangled host.
  it("IPv6 → invalid", () => {
    expect(splitHostPort("[::1]:8443")).toBeNull();
    expect(splitHostPort("::1")).toBeNull();
    expect(splitHostPort("2001:db8::1")).toBeNull();
  });

  it("junk with a colon or nothing left → invalid", () => {
    expect(splitHostPort("google.com: google.com")).toBeNull();
    expect(splitHostPort("https://")).toBeNull();
  });
});
