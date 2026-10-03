import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrayIcon, TRAY_MOODS } from "./trayIcons";

const LOOKS = [
  { icon: "rings", filled: false },
  { icon: "pulse", filled: false },
  { icon: "rings", filled: true },
  { icon: "pulse", filled: true },
] as const;

describe("TrayIcon", () => {
  it("draws every look in every state, each a different picture", () => {
    const seen = new Set<string>();
    for (const { icon, filled } of LOOKS) {
      for (const { mood } of TRAY_MOODS) {
        const { container, unmount } = render(<TrayIcon icon={icon} filled={filled} mood={mood} />);
        const svg = container.querySelector("svg.tray-icon")!;
        expect(svg).toHaveAttribute("data-icon", icon);
        expect(svg).toHaveAttribute("data-filled", String(filled));
        expect(svg).toHaveAttribute("data-mood", mood);
        expect(svg.children.length).toBeGreaterThan(0);
        seen.add(svg.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, ""));
        unmount();
      }
    }
    // Busy shares its picture with ok (only the colour differs), so 4 looks × 4 pictures, less the
    // two Offlines shared across glyphs (one bare Wi-Fi off, one filled).
    expect(seen.size).toBe(14);
  });

  it("filled looks cut the glyph out of a plate with a mask; bare ones do not", () => {
    for (const { icon, filled } of LOOKS) {
      const { container, unmount } = render(<TrayIcon icon={icon} filled={filled} mood="ok" />);
      expect(container.querySelector("mask") !== null).toBe(filled);
      unmount();
    }
  });

  it("offline is a Wi-Fi off, struck through, and alarm is not, in both pictures", () => {
    // The slash runs (4.5,4.5) → (19.5,19.5), possibly pulled in a little.
    const hasSlash = (icon: "rings" | "pulse", mood: "alarm" | "offline") => {
      const { container, unmount } = render(<TrayIcon icon={icon} filled={false} mood={mood} />);
      const found = Array.from(container.querySelectorAll("polyline")).some((p) => {
        const pts = p.getAttribute("points")!.split(" ").map((q) => q.split(",").map(Number));
        // Corner to corner: far from the centre at both ends (the X's arms stop well short).
        return pts.length === 2 && pts[0][0] < 8 && pts[0][1] < 8 && pts[1][0] > 16 && pts[1][1] > 16;
      });
      unmount();
      return found;
    };
    for (const icon of ["rings", "pulse"] as const) {
      expect(hasSlash(icon, "offline")).toBe(true);
      expect(hasSlash(icon, "alarm")).toBe(false);
    }
    const { container } = render(<TrayIcon icon="pulse" filled={false} mood="offline" />);
    expect(container.querySelectorAll("path")).toHaveLength(3); // the three Wi-Fi arcs
    expect(container.querySelector("rect"), "no Pulse frame: one Wi-Fi off for every look").toBeNull();
  });

  it("is decorative: hidden from assistive tech", () => {
    const { container } = render(<TrayIcon icon="rings" filled={false} mood="ok" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
