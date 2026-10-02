import { useId } from "react";
import type { TrayStyle } from "../types";

/**
 * Small drawings of the menu-bar (tray) icon, for the Settings picker.
 *
 * The real icon is drawn pixel by pixel in Rust (`src-tauri/src/tray.rs`). These are the same
 * shapes in the same 24-unit box with the same numbers (`prims` / `filled_prims` there), as SVG, so
 * the picker shows what the menu bar will show. Change one, change the other.
 */

export type TrayMood = "ok" | "warn" | "alarm" | "offline" | "busy";

/** Every state a tray icon can show, in the order the picker lists them. */
export const TRAY_MOODS: { mood: TrayMood; title: string }[] = [
  { mood: "ok", title: "All clear" },
  { mood: "warn", title: "Heads up" },
  { mood: "alarm", title: "Alarm" },
  { mood: "offline", title: "Offline" },
  { mood: "busy", title: "Checking" },
];

export const TRAY_STYLES: { style: TrayStyle; label: string }[] = [
  { style: "rings", label: "Rings" },
  { style: "pulse", label: "Pulse" },
  { style: "rings-filled", label: "Filled rings" },
  { style: "pulse-filled", label: "Filled pulse" },
];

const MOOD_COLOR: Record<TrayMood, string> = {
  ok: "var(--state-up)",
  warn: "var(--state-blocked)",
  alarm: "var(--state-down)",
  offline: "var(--state-offline)",
  busy: "var(--state-checking)",
};

type Pt = readonly [number, number];
type Dash = readonly [number, number];
type Shape =
  | { t: "ring"; r: number; w: number; a: number; dash?: Dash }
  | { t: "line"; pts: readonly Pt[]; w: number; a: number; dash?: Dash; k: number }
  | { t: "dot"; x: number; y: number; r: number }
  | { t: "frame" };

const C = 12; // the box centre
const RING_W = 1.9;
const LINE_W = 2.2;
const PULSE_W = 1.9;
const PULSE_FIT = 0.7;
const FRAME_HALF = 10.4;
const FRAME_CORNER = 4.0;
const PLATE_HALF = 11.0;
const PLATE_CORNER = 4.8;
const FILLED_RING_W = 1.7;

const BEAT_OK: Pt[] = [[2, 12], [6, 12], [9, 3], [15, 21], [18, 12], [22, 12]];
const BEAT_WARN: Pt[] = [[2, 12], [10, 12], [12, 8], [15, 16], [17, 12], [22, 12]];
const FLAT: Pt[] = [[2, 12], [22, 12]];
const CROSS_A: Pt[] = [[9, 8], [15, 16]];
const CROSS_B: Pt[] = [[15, 8], [9, 16]];
const SLASH: Pt[] = [[4.5, 4.5], [19.5, 19.5]];
const BANG: Pt[] = [[12, 9], [12, 12.6]];

type Glyph = "rings" | "pulse";

/** The shapes on the bare menu bar. */
function bare(glyph: Glyph, mood: TrayMood): Shape[] {
  const ring = (r: number, a: number, dash?: Dash): Shape => ({ t: "ring", r, w: RING_W, a, dash });
  if (glyph === "rings") {
    if (mood === "ok" || mood === "busy") {
      return [ring(3.2, 1), ring(6.8, 0.75), ring(10.6, 0.5)];
    }
    if (mood === "warn") {
      return [
        ring(6.8, 0.8),
        ring(10.6, 0.6, [3.0, 2.12]),
        { t: "line", pts: BANG, w: 2.0, a: 1, k: 1 },
        { t: "dot", x: 12, y: 15.6, r: 1.2 },
      ];
    }
    const alarm = [ring(3.2, 1, [2.4, 1.62]), ring(6.8, 0.8, [2.7, 1.57]), ring(10.6, 0.55, [3.0, 1.76])];
    return mood === "offline"
      ? [...alarm, { t: "line", pts: SLASH, w: LINE_W, a: 1, k: 1 }]
      : alarm;
  }
  const line = (pts: Pt[], a: number, k: number, dash?: Dash): Shape => ({
    t: "line", pts, w: PULSE_W, a, dash, k,
  });
  const frame: Shape = { t: "frame" };
  if (mood === "ok" || mood === "busy") return [frame, line(BEAT_OK, 1, PULSE_FIT)];
  if (mood === "warn") return [frame, line(BEAT_WARN, 1, PULSE_FIT)];
  if (mood === "alarm") {
    return [
      frame,
      line(FLAT, 0.7, PULSE_FIT, [1.75, 1.75]),
      line(CROSS_A, 1, 0.95),
      line(CROSS_B, 1, 0.95),
    ];
  }
  return [
    frame,
    line(FLAT, 0.7, PULSE_FIT, [1.75, 1.75]),
    { t: "line", pts: SLASH, w: LINE_W, a: 1, k: 1 },
  ];
}

/** The shapes cut out of the filled plate. */
function cutOut(glyph: Glyph, mood: TrayMood): Shape[] {
  const ring = (r: number, a: number, dash?: Dash): Shape => ({ t: "ring", r, w: FILLED_RING_W, a, dash });
  const line = (pts: Pt[], w: number, a: number, k: number, dash?: Dash): Shape => ({
    t: "line", pts, w, a, dash, k,
  });
  if (glyph === "rings") {
    if (mood === "ok" || mood === "busy") return [ring(2.3, 1), ring(5.0, 0.85), ring(7.7, 0.65)];
    if (mood === "warn") {
      return [
        ring(5.0, 0.9),
        ring(7.7, 0.65, [2.5, 1.53]),
        line(BANG, 1.7, 1, 0.72),
        { t: "dot", x: 12, y: 14.6, r: 1.0 },
      ];
    }
    const alarm = [ring(3.0, 1, [3.0, 1.71]), ring(7.4, 0.8, [3.4, 1.77])];
    return mood === "offline" ? [...alarm, line(SLASH, 2.0, 1, 0.8)] : alarm;
  }
  const trace = (pts: Pt[], a: number, dash?: Dash) => line(pts, PULSE_W, a, 0.78, dash);
  if (mood === "ok" || mood === "busy") return [trace(BEAT_OK, 1)];
  if (mood === "warn") return [trace(BEAT_WARN, 1)];
  if (mood === "alarm") {
    return [
      trace(FLAT, 0.7, [1.95, 1.95]),
      line(CROSS_A, PULSE_W, 1, 0.95),
      line(CROSS_B, PULSE_W, 1, 0.95),
    ];
  }
  return [trace(FLAT, 0.7, [1.95, 1.95]), line(SLASH, 2.0, 1, 0.85)];
}

const fit = (pts: readonly Pt[], k: number) =>
  pts.map(([x, y]) => `${C + (x - C) * k},${C + (y - C) * k}`).join(" ");

function drawShape(s: Shape, i: number, ink: string) {
  switch (s.t) {
    case "ring":
      return (
        <circle
          key={i}
          cx={C} cy={C} r={s.r}
          fill="none" stroke={ink} strokeWidth={s.w} opacity={s.a}
          strokeDasharray={s.dash?.join(" ")}
        />
      );
    case "line":
      return (
        <polyline
          key={i}
          points={fit(s.pts, s.k)}
          fill="none" stroke={ink} strokeWidth={s.w} opacity={s.a}
          strokeLinejoin="round"
          // A dashed line has square dashes; a solid one has round ends.
          strokeLinecap={s.dash ? "butt" : "round"}
          strokeDasharray={s.dash?.join(" ")}
        />
      );
    case "dot":
      return <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={ink} />;
    case "frame":
      return (
        <rect
          key={i}
          x={C - FRAME_HALF} y={C - FRAME_HALF}
          width={FRAME_HALF * 2} height={FRAME_HALF * 2}
          rx={FRAME_CORNER}
          fill="none" stroke={ink} strokeWidth={RING_W} opacity={0.75}
        />
      );
  }
}

/** One menu-bar icon: a style in one state. Decorative — the caller labels it. */
export function TrayIcon({
  style,
  mood,
  size = 20,
}: {
  style: TrayStyle;
  mood: TrayMood;
  size?: number;
}) {
  const maskId = useId();
  const filled = style === "rings-filled" || style === "pulse-filled";
  const glyph: Glyph = style.startsWith("rings") ? "rings" : "pulse";
  return (
    <svg
      className="tray-icon"
      data-style={style}
      data-mood={mood}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ color: MOOD_COLOR[mood] }}
    >
      {filled ? (
        <>
          {/* The glyph is a hole in the plate: black strokes on a white mask. */}
          <mask id={maskId}>
            <rect
              x={C - PLATE_HALF} y={C - PLATE_HALF}
              width={PLATE_HALF * 2} height={PLATE_HALF * 2}
              rx={PLATE_CORNER} fill="#fff"
            />
            {cutOut(glyph, mood).map((s, i) => drawShape(s, i, "#000"))}
          </mask>
          <rect
            x={C - PLATE_HALF} y={C - PLATE_HALF}
            width={PLATE_HALF * 2} height={PLATE_HALF * 2}
            rx={PLATE_CORNER} fill="currentColor" mask={`url(#${maskId})`}
          />
        </>
      ) : (
        bare(glyph, mood).map((s, i) => drawShape(s, i, "currentColor"))
      )}
    </svg>
  );
}
