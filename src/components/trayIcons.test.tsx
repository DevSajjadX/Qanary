import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrayIcon, TRAY_MOODS, TRAY_STYLES } from "./trayIcons";

describe("TrayIcon", () => {
  it("draws every style in every state, each a different picture", () => {
    const seen = new Set<string>();
    for (const { style } of TRAY_STYLES) {
      for (const { mood } of TRAY_MOODS) {
        const { container, unmount } = render(<TrayIcon style={style} mood={mood} />);
        const svg = container.querySelector("svg.tray-icon")!;
        expect(svg).toHaveAttribute("data-style", style);
        expect(svg).toHaveAttribute("data-mood", mood);
        expect(svg.children.length).toBeGreaterThan(0);
        seen.add(svg.innerHTML.replace(/id="[^"]*"|url\(#[^)]*\)/g, ""));
        unmount();
      }
    }
    // Busy shares its picture with ok (only the colour differs), so 4 styles × 4 pictures.
    expect(seen.size).toBe(16);
  });

  it("filled looks cut the glyph out of a plate with a mask; bare ones do not", () => {
    for (const { style } of TRAY_STYLES) {
      const { container, unmount } = render(<TrayIcon style={style} mood="ok" />);
      const filled = style.endsWith("filled");
      expect(container.querySelector("mask") !== null).toBe(filled);
      unmount();
    }
  });

  it("offline is struck through and alarm is not, in both pictures", () => {
    // The slash runs (4.5,4.5) → (19.5,19.5), possibly pulled in a little.
    const hasSlash = (style: "rings" | "pulse", mood: "alarm" | "offline") => {
      const { container, unmount } = render(<TrayIcon style={style} mood={mood} />);
      const found = Array.from(container.querySelectorAll("polyline")).some((p) => {
        const pts = p.getAttribute("points")!.split(" ").map((q) => q.split(",").map(Number));
        // Corner to corner: far from the centre at both ends (the X's arms stop well short).
        return pts.length === 2 && pts[0][0] < 8 && pts[0][1] < 8 && pts[1][0] > 16 && pts[1][1] > 16;
      });
      unmount();
      return found;
    };
    for (const style of ["rings", "pulse"] as const) {
      expect(hasSlash(style, "offline")).toBe(true);
      expect(hasSlash(style, "alarm")).toBe(false);
    }
  });

  it("is decorative: hidden from assistive tech", () => {
    const { container } = render(<TrayIcon style="rings" mood="ok" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
