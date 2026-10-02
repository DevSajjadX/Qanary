//! System-tray helpers for Qanary.
//!
//! `build_tray` creates the menu-bar icon and wires all interactions:
//!   - Icon colour and shape reflect `Severity` (green / amber / red), drawn as rings or a
//!     heartbeat (`TrayStyle`).
//!   - Left-click → toggle main window.
//!   - Context menu → Show / Hide · Refresh now · Quit.
//! Icon pixels are generated at runtime — no binary asset files.
//!
//! Call `build_tray` once inside `setup()` **before** the first `emit_checking`
//! so the tray handle exists when `update_icon` is first invoked.

use crate::models::{Severity, TrayStyle};
use crate::tray_menu::{list_lines, Dot, ListLine};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// Generation counter for the breathing animation. `update_checking` claims the next
/// value and animates while it stays current; any later `update_icon`/`update_checking`
/// bumps it, which stops the previous loop. (Lets us cancel without channels.)
static ANIM_GEN: AtomicU64 = AtomicU64::new(0);

/// The icon look in force (an index into `ALL_STYLES`). Set from the config at startup and whenever
/// Settings, import or reset changes it; read on every redraw, so a running breathing animation
/// switches look on its next frame.
static STYLE: AtomicU8 = AtomicU8::new(0); // 0 = the default, Rings

/// True while the breathing "checking" animation owns the icon.
static CHECKING: AtomicBool = AtomicBool::new(false);

/// The last settled state (severity, cut-off), kept so a style change can redraw the icon
/// without waiting for the next probe result. `None` until the first result lands.
static LAST: Mutex<Option<(Severity, bool)>> = Mutex::new(None);

const ALL_STYLES: [TrayStyle; 4] =
    [TrayStyle::Rings, TrayStyle::Pulse, TrayStyle::RingsFilled, TrayStyle::PulseFilled];

fn style_id(style: TrayStyle) -> u8 {
    ALL_STYLES.iter().position(|s| *s == style).unwrap_or(0) as u8
}

/// The list rows the menu shows (or is about to show), so an unchanged menu is not rebuilt (replacing
/// a menu that is open closes it). Only ever held briefly: never across a call that waits on the
/// main thread.
static MENU_LINES: Mutex<Vec<ListLine>> = Mutex::new(Vec::new());

fn current_style() -> TrayStyle {
    ALL_STYLES.get(STYLE.load(Ordering::SeqCst) as usize).copied().unwrap_or_default()
}

/// Context-menu item identifiers.
const ID_SHOW_HIDE: &str = "show_hide";
const ID_REFRESH: &str = "refresh_now";
const ID_QUIT: &str = "quit";
/// A list's row; the list id follows the prefix. Clicking it shows the main window.
const ID_LIST_PREFIX: &str = "list:";

/// Palette colours, matching `src/tokens.css` (the authoritative source):
///   up #2fd08a · blocked #ff9a3d (heads up) · down #ff5a52 · offline #b8123f · checking #8b93a3
const COLOR_OK: (u8, u8, u8) = (0x2f, 0xd0, 0x8a);
const COLOR_WARN: (u8, u8, u8) = (0xff, 0x9a, 0x3d);
const COLOR_ALARM: (u8, u8, u8) = (0xff, 0x5a, 0x52);
const COLOR_OFFLINE: (u8, u8, u8) = (0xb8, 0x12, 0x3f);
const COLOR_CHECKING: (u8, u8, u8) = (0x8b, 0x93, 0xa3);

/// What the icon says. `Busy` is the in-flight state (a probe round is running); the rest map
/// 1:1 from `Severity`. Same vocabulary as the in-app `Mood` (`src/components/orbIcons.tsx`).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Mood {
    Ok,
    Warn,
    Alarm,
    /// Cut off: nothing anywhere is reachable. Alarm's look, struck through.
    Offline,
    Busy,
}

fn mood_of(sev: Severity, cut_off: bool) -> Mood {
    if cut_off {
        return Mood::Offline;
    }
    match sev {
        Severity::Green => Mood::Ok,
        Severity::Yellow => Mood::Warn,
        Severity::Red => Mood::Alarm,
    }
}

fn mood_color(mood: Mood) -> (u8, u8, u8) {
    match mood {
        Mood::Ok => COLOR_OK,
        Mood::Warn => COLOR_WARN,
        Mood::Alarm => COLOR_ALARM,
        Mood::Offline => COLOR_OFFLINE,
        Mood::Busy => COLOR_CHECKING,
    }
}

// ---------------------------------------------------------------------------------------------
// Drawing. The icon is a handful of simple shapes in a 24×24 box — the same box and the same
// coordinates as the in-app SVGs, so the two never drift apart. Each pixel is sampled several
// times and averaged (supersampling) for smooth edges; there are no image files.
// ---------------------------------------------------------------------------------------------

/// Output size in pixels. macOS draws a tray icon 18 pt tall whatever its pixel size, so 44 px
/// is sharp on a 2× (Retina) menu bar.
const SIZE: u32 = 44;
/// Samples per pixel side (SS × SS per pixel).
const SS: u32 = 4;
/// The shapes below are written in this 24-unit box (the SVG `viewBox`).
const VIEW: f32 = 24.0;
const CENTER: f32 = 12.0;

/// Signed distance to a rounded square around the box centre (negative inside).
fn sd_round_rect(x: f32, y: f32, half: f32, corner: f32) -> f32 {
    let qx = (x - CENTER).abs() - (half - corner);
    let qy = (y - CENTER).abs() - (half - corner);
    (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt() + qx.max(qy).min(0.0) - corner
}

/// A filled rounded-square plate behind the glyph; the glyph is cut out of it (transparent).
struct Plate {
    half: f32,
    corner: f32,
}
const PLATE: Plate = Plate { half: 11.0, corner: 4.8 };

/// The picture a style draws; `TrayStyle` adds whether it sits on a filled plate.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Glyph {
    Rings,
    Pulse,
}

fn split(style: TrayStyle) -> (Glyph, bool) {
    match style {
        TrayStyle::Rings => (Glyph::Rings, false),
        TrayStyle::Pulse => (Glyph::Pulse, false),
        TrayStyle::RingsFilled => (Glyph::Rings, true),
        TrayStyle::PulseFilled => (Glyph::Pulse, true),
    }
}

/// One shape. `a` is its opacity. `dash` = (on, off) lengths in box units, butt-capped.
enum Prim {
    /// A circle outline around the box centre.
    Ring { r: f32, w: f32, a: f32, dash: Option<(f32, f32)> },
    /// A polyline with round caps and joins.
    /// `k` shrinks the points toward the box centre (1.0 = as written); `w` and `dash` are in
    /// box units, already final.
    Line { pts: &'static [(f32, f32)], w: f32, a: f32, dash: Option<(f32, f32)>, k: f32 },
    /// A rounded-square outline around the box centre (`half` = half the side).
    Frame { half: f32, corner: f32, w: f32, a: f32 },
    /// A solid dot.
    Dot { x: f32, y: f32, r: f32 },
}

const RING_W: f32 = 1.9;
const LINE_W: f32 = 2.2;

// Pulse traces (the in-app `BEAT_OK` / `BEAT_WARN` / flat line, as points).
const BEAT_OK: &[(f32, f32)] = &[(2., 12.), (6., 12.), (9., 3.), (15., 21.), (18., 12.), (22., 12.)];
const BEAT_WARN: &[(f32, f32)] = &[(2., 12.), (10., 12.), (12., 8.), (15., 16.), (17., 12.), (22., 12.)];
const FLAT: &[(f32, f32)] = &[(2., 12.), (22., 12.)];
const CROSS_A: &[(f32, f32)] = &[(9., 8.), (15., 16.)];
const CROSS_B: &[(f32, f32)] = &[(15., 8.), (9., 16.)];
const SLASH: &[(f32, f32)] = &[(4.5, 4.5), (19.5, 19.5)];
/// The Pulse icon sits in a rounded square: the frame, and the trace shrunk to fit inside it.
const FRAME_HALF: f32 = 10.4;
const FRAME_CORNER: f32 = 4.0;
const PULSE_FIT: f32 = 0.7;
const PULSE_W: f32 = 1.9;
const BANG: &[(f32, f32)] = &[(12., 9.), (12., 12.6)];

/// The shapes for one style + mood. Opacities are the app's, nudged up a little: the app draws
/// on a coloured orb, the tray draws straight on the menu bar, where faint rings would vanish.
fn prims(glyph: Glyph, mood: Mood) -> Vec<Prim> {
    let ring = |r, a, dash| Prim::Ring { r, w: RING_W, a, dash };
    match (glyph, mood) {
        (Glyph::Rings, Mood::Ok | Mood::Busy) => {
            vec![ring(3.2, 1.0, None), ring(6.8, 0.75, None), ring(10.6, 0.5, None)]
        }
        (Glyph::Rings, Mood::Warn) => vec![
            ring(6.8, 0.8, None),
            ring(10.6, 0.6, Some((3.0, 2.12))),
            Prim::Line { pts: BANG, w: 2.0, a: 1.0, dash: None, k: 1.0 },
            Prim::Dot { x: 12.0, y: 15.6, r: 1.2 },
        ],
        (Glyph::Rings, Mood::Alarm | Mood::Offline) => {
            let mut v = vec![
            // Dash periods divide each circumference evenly (5, 10 and 14 dashes), so there is
            // no odd-sized dash where the pattern meets itself.
            ring(3.2, 1.0, Some((2.4, 1.62))),
            ring(6.8, 0.8, Some((2.7, 1.57))),
            ring(10.6, 0.55, Some((3.0, 1.76))),
            ];
            if mood == Mood::Offline {
                v.push(Prim::Line { pts: SLASH, w: LINE_W, a: 1.0, dash: None, k: 1.0 });
            }
            v
        }
        // Pulse: every state sits inside the same rounded square.
        (Glyph::Pulse, mood) => {
            let line = |pts, a, dash, k| Prim::Line { pts, w: PULSE_W, a, dash, k };
            let mut v = vec![Prim::Frame { half: FRAME_HALF, corner: FRAME_CORNER, w: RING_W, a: 0.75 }];
            match mood {
                Mood::Ok | Mood::Busy => v.push(line(BEAT_OK, 1.0, None, PULSE_FIT)),
                Mood::Warn => v.push(line(BEAT_WARN, 1.0, None, PULSE_FIT)),
                // A dead flat line marked with an X. (The dash period divides the line evenly.)
                Mood::Alarm => {
                    v.push(line(FLAT, 0.7, Some((1.75, 1.75)), PULSE_FIT));
                    v.push(line(CROSS_A, 1.0, None, 0.95));
                    v.push(line(CROSS_B, 1.0, None, 0.95));
                }
                // The same flat line, struck through by a slash across the whole frame (the X is
                // Alarm's alone — the two must read apart).
                Mood::Offline => {
                    v.push(line(FLAT, 0.7, Some((1.75, 1.75)), PULSE_FIT));
                    v.push(Prim::Line { pts: SLASH, w: LINE_W, a: 1.0, dash: None, k: 1.0 });
                }
            }
            v
        }
    }
}

const FILLED_RING_W: f32 = 1.7;

/// The glyph for the filled look: the same pictures, sized to sit inside the plate. They are cut
/// out of the plate, so opacities are a little higher than on the bare menu bar.
fn filled_prims(glyph: Glyph, mood: Mood) -> Vec<Prim> {
    let ring = |r, a, dash| Prim::Ring { r, w: FILLED_RING_W, a, dash };
    let line = |pts, w, a, dash, k| Prim::Line { pts, w, a, dash, k };
    match (glyph, mood) {
        (Glyph::Rings, Mood::Ok | Mood::Busy) => {
            vec![ring(2.3, 1.0, None), ring(5.0, 0.85, None), ring(7.7, 0.65, None)]
        }
        (Glyph::Rings, Mood::Warn) => vec![
            ring(5.0, 0.9, None),
            ring(7.7, 0.65, Some((2.5, 1.53))),
            line(BANG, 1.7, 1.0, None, 0.72),
            Prim::Dot { x: 12.0, y: 14.6, r: 1.0 },
        ],
        (Glyph::Rings, Mood::Alarm | Mood::Offline) => {
            // Two coarse dashed rings, not three: at this size three read as noise. Dash
            // periods divide each circumference evenly (4 and 9 dashes).
            let mut v = vec![
                ring(3.0, 1.0, Some((3.0, 1.71))),
                ring(7.4, 0.8, Some((3.4, 1.77))),
            ];
            if mood == Mood::Offline {
                v.push(line(SLASH, 2.0, 1.0, None, 0.8));
            }
            v
        }
        (Glyph::Pulse, mood) => {
            let trace = |pts, a, dash| line(pts, PULSE_W, a, dash, 0.78);
            match mood {
                Mood::Ok | Mood::Busy => vec![trace(BEAT_OK, 1.0, None)],
                Mood::Warn => vec![trace(BEAT_WARN, 1.0, None)],
                Mood::Alarm => vec![
                    trace(FLAT, 0.7, Some((1.95, 1.95))),
                    line(CROSS_A, PULSE_W, 1.0, None, 0.95),
                    line(CROSS_B, PULSE_W, 1.0, None, 0.95),
                ],
                Mood::Offline => vec![
                    trace(FLAT, 0.7, Some((1.95, 1.95))),
                    line(SLASH, 2.0, 1.0, None, 0.85),
                ],
            }
        }
    }
}

/// Opacity of one shape at a point of the 24-unit box (0 = outside it).
fn prim_alpha(p: &Prim, x: f32, y: f32) -> f32 {
    match *p {
        Prim::Ring { r, w, a, dash } => {
            let (dx, dy) = (x - CENTER, y - CENTER);
            if ((dx * dx + dy * dy).sqrt() - r).abs() > w / 2.0 {
                return 0.0;
            }
            if let Some((on, off)) = dash {
                // Dashes run clockwise from 3 o'clock, like an SVG circle.
                let mut theta = dy.atan2(dx);
                if theta < 0.0 {
                    theta += std::f32::consts::TAU;
                }
                if (theta * r) % (on + off) > on {
                    return 0.0;
                }
            }
            a
        }
        Prim::Line { pts, w, a, dash, k } => {
            // Nearest point on the polyline, and how far along it that point is.
            let (mut best, mut along, mut walked) = (f32::MAX, 0.0_f32, 0.0_f32);
            for seg in pts.windows(2) {
                let fit = |(px, py): (f32, f32)| (CENTER + (px - CENTER) * k, CENTER + (py - CENTER) * k);
                let ((ax, ay), (bx, by)) = (fit(seg[0]), fit(seg[1]));
                let (vx, vy) = (bx - ax, by - ay);
                let len2 = vx * vx + vy * vy;
                let t = (((x - ax) * vx + (y - ay) * vy) / len2).clamp(0.0, 1.0);
                let (qx, qy) = (ax + t * vx, ay + t * vy);
                let d = ((x - qx).powi(2) + (y - qy).powi(2)).sqrt();
                if d < best {
                    best = d;
                    along = walked + t * len2.sqrt();
                }
                walked += len2.sqrt();
            }
            if best > w / 2.0 {
                return 0.0;
            }
            if let Some((on, off)) = dash {
                if along % (on + off) > on {
                    return 0.0;
                }
            }
            a
        }
        Prim::Frame { half, corner, w, a } => {
            // The outline is the band of width `w` around the rounded square's edge.
            if sd_round_rect(x, y, half, corner).abs() <= w / 2.0 {
                a
            } else {
                0.0
            }
        }
        Prim::Dot { x: cx, y: cy, r } => {
            if ((x - cx).powi(2) + (y - cy).powi(2)).sqrt() <= r {
                1.0
            } else {
                0.0
            }
        }
    }
}

/// Tray icon for a settled state (static, full opacity). `cut_off` = nothing anywhere is
/// reachable; it wins over the severity, like the in-app Offline mood.
pub fn status_icon(sev: Severity, cut_off: bool, style: TrayStyle) -> tauri::image::Image<'static> {
    let mood = mood_of(sev, cut_off);
    render(style, mood, mood_color(mood), 1.0)
}

/// One breathing frame of the busy/checking icon — grey like the in-app busy orb; `pulse` in
/// 0..1 scales the opacity so the icon appears to breathe.
fn checking_frame(style: TrayStyle, pulse: f32) -> tauri::image::Image<'static> {
    render(style, Mood::Busy, COLOR_CHECKING, pulse)
}

fn render(style: TrayStyle, mood: Mood, rgb: (u8, u8, u8), pulse: f32) -> tauri::image::Image<'static> {
    let (glyph, filled) = split(style);
    if filled {
        draw_icon(&filled_prims(glyph, mood), rgb, pulse, Some(&PLATE))
    } else {
        draw_icon(&prims(glyph, mood), rgb, pulse, None)
    }
}

/// Rasterise `shapes` in one colour (or, with a `plate`, cut them out of a filled plate). `pulse` (0..1) dims the whole icon for the breathing
/// animation; 1.0 = static. Corners stay transparent.
fn draw_icon(
    shapes: &[Prim],
    rgb: (u8, u8, u8),
    pulse: f32,
    plate: Option<&Plate>,
) -> tauri::image::Image<'static> {
    let pulse = pulse.clamp(0.0, 1.0);
    let step = VIEW / (SIZE * SS) as f32; // one sample, in box units
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    for py in 0..SIZE {
        for px in 0..SIZE {
            let mut covered = 0.0_f32;
            for sy in 0..SS {
                for sx in 0..SS {
                    let x = ((px * SS + sx) as f32 + 0.5) * step;
                    let y = ((py * SS + sy) as f32 + 0.5) * step;
                    // Union of the shapes: overlapping ones never add up past 1.
                    let mut a = 0.0_f32;
                    for s in shapes {
                        let sa = prim_alpha(s, x, y);
                        a += sa * (1.0 - a);
                    }
                    covered += match plate {
                        // On a plate the glyph is a hole in it.
                        Some(p) if sd_round_rect(x, y, p.half, p.corner) <= 0.0 => 1.0 - a,
                        Some(_) => 0.0,
                        None => a,
                    };
                }
            }
            let alpha = covered / (SS * SS) as f32 * pulse;
            let o = ((py * SIZE + px) * 4) as usize;
            rgba[o] = rgb.0;
            rgba[o + 1] = rgb.1;
            rgba[o + 2] = rgb.2;
            rgba[o + 3] = (alpha * 255.0).round() as u8;
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}

/// Update the tray icon to reflect the current `Severity`.
/// Cancels any running breathing animation. No-op if the tray doesn't exist yet.
pub fn update_icon(app: &AppHandle, sev: Severity, cut_off: bool) {
    ANIM_GEN.fetch_add(1, Ordering::SeqCst); // stop any breathing loop
    CHECKING.store(false, Ordering::SeqCst);
    *LAST.lock().unwrap() = Some((sev, cut_off));
    set_tray_image(app, status_icon(sev, cut_off, current_style()));
    refresh_menu(app);
}

/// Set the icon look before the tray exists (startup). Draws nothing.
pub fn init_style(style: TrayStyle) {
    STYLE.store(style_id(style), Ordering::SeqCst);
}

/// Switch the icon look live (Settings, import, reset). Redraws at once from the last settled
/// state; while a probe round is breathing the next frame picks the new look up by itself.
pub fn set_style(app: &AppHandle, style: TrayStyle) {
    STYLE.store(style_id(style), Ordering::SeqCst);
    if CHECKING.load(Ordering::SeqCst) {
        return;
    }
    let last = *LAST.lock().unwrap();
    if let Some((sev, cut_off)) = last {
        set_tray_image(app, status_icon(sev, cut_off, style));
    }
}

/// Start the busy/checking state: a breathing brand-yellow dot, mirroring the status
/// button's `qbreathe`. Animates on a background task until the next `update_icon`
/// (cycle settles) or `update_checking` supersedes it.
pub fn update_checking(app: &AppHandle) {
    let generation = ANIM_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    CHECKING.store(true, Ordering::SeqCst);
    refresh_menu(app); // lists may have been added, renamed or removed
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut t: f32 = 0.0;
        // ponytail: ~11 fps sine pulse; cheap, stops the instant the cycle settles.
        while ANIM_GEN.load(Ordering::SeqCst) == generation {
            // Breathe opacity 0.45 → 1.0 and back, like qbreathe's scale/opacity.
            let pulse = 0.45 + 0.55 * (0.5 - 0.5 * t.cos());
            set_tray_image(&app, checking_frame(current_style(), pulse));
            t += 0.5;
            tokio::time::sleep(Duration::from_millis(90)).await;
        }
    });
}

fn set_tray_image(app: &AppHandle, img: tauri::image::Image<'static>) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(img));
        // Re-assert: set_icon can reset the template flag, which would strip our colour.
        let _ = tray.set_icon_as_template(false);
    }
}

/// The coloured dot beside a list's row, in the same palette as the icon.
fn dot_icon(dot: Dot) -> Image<'static> {
    let rgb = match dot {
        Dot::Ok => COLOR_OK,
        Dot::Warn => COLOR_WARN,
        Dot::Alarm => COLOR_ALARM,
        Dot::Offline => COLOR_OFFLINE,
        Dot::Checking => COLOR_CHECKING,
    };
    // macOS shows menu icons 18 pt square; the dot fills about two thirds of that.
    draw_icon(&[Prim::Dot { x: CENTER, y: CENTER, r: 8.0 }], rgb, 1.0, None)
}

/// The tray menu: one row per list (a coloured dot and "name · 3/5"), then the fixed actions.
fn build_menu(app: &AppHandle, lines: &[ListLine]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    for line in lines {
        menu.append(&IconMenuItem::with_id(
            app,
            format!("{ID_LIST_PREFIX}{}", line.id),
            &line.label,
            true,
            Some(dot_icon(line.dot)),
            None::<&str>,
        )?)?;
    }
    if !lines.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(app, ID_SHOW_HIDE, "Show / Hide", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, ID_REFRESH, "Refresh now", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, ID_QUIT, "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

/// Rebuild the menu from the live snapshot — but only if what it shows changed. Call it after
/// anything that changes a list's count, status, name or position; calling it too often is cheap.
/// Must be called with the snapshot lock *released* (it takes it).
pub fn refresh_menu(app: &AppHandle) {
    let lines = {
        let state = app.state::<crate::state::AppState>();
        let guard = state.snapshot.lock().unwrap();
        match guard.as_ref() {
            Some(snap) => list_lines(&snap.lists, snap.cut_off),
            None => return, // nothing probed or painted yet: keep the menu as built
        }
    };
    // Not built yet (the tray exists before the first snapshot, but be safe): nothing to update.
    if app.tray_by_id("main").is_none() {
        return;
    }
    {
        let mut shown = MENU_LINES.lock().unwrap();
        if *shown == lines {
            return;
        }
        *shown = lines.clone();
    } // The lock is released *before* touching the menu — see below.

    // Building a menu and setting it each hop to the main thread and WAIT for it. Doing that from a
    // worker while holding MENU_LINES would deadlock the moment the main thread (a sync command, a
    // menu click) wants the same lock. So the work is handed to the main thread without waiting;
    // the queue is first-in-first-out, so the last change wins.
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let (Some(tray), Ok(menu)) = (handle.tray_by_id("main"), build_menu(&handle, &lines)) {
            let _ = tray.set_menu(Some(menu));
        }
    });
}

/// Show + focus the main window (never hides it) — a list row was clicked.
fn show_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Toggle the main window: hide if visible, show + focus if hidden.
fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STYLES: [TrayStyle; 4] = ALL_STYLES;
    const SEVERITIES: [Severity; 3] = [Severity::Green, Severity::Yellow, Severity::Red];

    /// RGBA of one pixel, addressed in the 24-unit drawing box (like the in-app SVGs).
    fn at(img: &tauri::image::Image<'_>, ux: f32, uy: f32) -> (u8, u8, u8, u8) {
        let px = (ux / VIEW * img.width() as f32) as u32;
        let py = (uy / VIEW * img.height() as f32) as u32;
        let i = ((py * img.width() + px) * 4) as usize;
        let d = img.rgba();
        (d[i], d[i + 1], d[i + 2], d[i + 3])
    }

    #[test]
    fn icons_are_44px_with_transparent_corners() {
        for style in STYLES {
            for sev in SEVERITIES {
                let img = status_icon(sev, false, style);
                assert_eq!((img.width(), img.height()), (44, 44));
                assert_eq!(at(&img, 0.2, 0.2).3, 0, "corner must be transparent");
            }
        }
    }

    /// Rings: the middle ring sits at r = 6.8 (full colour at 70%), the centre is hollow.
    #[test]
    fn rings_ok_is_green_rings_around_a_hollow_centre() {
        let img = status_icon(Severity::Green, false, TrayStyle::Rings);
        let (r, g, b, a) = at(&img, CENTER + 6.8, CENTER);
        assert_eq!((r, g, b), COLOR_OK);
        assert!(a > 150, "ring should be mostly opaque, got {a}");
        assert_eq!(at(&img, CENTER, CENTER).3, 0, "centre of the rings is empty");
    }

    /// Pulse: the beat's upward spike peaks at (9, 3) in the full-size trace, shrunk to fit the frame.
    #[test]
    fn pulse_ok_draws_the_beat() {
        let img = status_icon(Severity::Green, false, TrayStyle::Pulse);
        let fit = |v: f32| CENTER + (v - CENTER) * PULSE_FIT;
        let (r, g, b, a) = at(&img, fit(9.0), fit(3.0));
        assert_eq!((r, g, b), COLOR_OK);
        assert_eq!(a, 255);
        assert_eq!(at(&img, 12.0, 20.0).3, 0, "nothing below the trace's centre section");
    }

    /// Every Pulse state sits in the same rounded-square frame (and Rings has none).
    #[test]
    fn pulse_states_sit_in_a_rounded_square() {
        for (sev, cut_off) in [
            (Severity::Green, false),
            (Severity::Yellow, false),
            (Severity::Red, false),
            (Severity::Red, true),
        ] {
            let img = status_icon(sev, cut_off, TrayStyle::Pulse);
            assert!(at(&img, CENTER + FRAME_HALF, CENTER).3 > 150, "{sev:?}/{cut_off}: frame edge");
            assert!(at(&img, CENTER, CENTER - FRAME_HALF).3 > 150, "{sev:?}/{cut_off}: frame top");
            // Rounded: the very corner of the square is empty.
            // (A sharp square would be filled here.)
            assert_eq!(at(&img, CENTER + FRAME_HALF + 0.5, CENTER + FRAME_HALF + 0.5).3, 0);
        }
        let rings = status_icon(Severity::Green, false, TrayStyle::Rings);
        assert_eq!(at(&rings, CENTER + FRAME_HALF, CENTER - FRAME_HALF + 2.0).3, 0);
    }

    /// Cut-off wins over the severity: crimson, and a slash that Alarm doesn't have.
    #[test]
    fn offline_is_crimson_and_struck_through() {
        for style in STYLES {
            let off = status_icon(Severity::Red, true, style);
            let alarm = status_icon(Severity::Red, false, style);
            let opaque = off.rgba().chunks(4).find(|p| p[3] == 255).expect("an opaque pixel");
            assert_eq!((opaque[0], opaque[1], opaque[2]), COLOR_OFFLINE);
            assert_ne!(off.rgba(), alarm.rgba(), "{style:?}: offline must differ from alarm");
            // The slash runs corner to corner, through the middle of the box.
            // The slash crosses the centre: solid on a bare icon, a hole in a filled one.
            let filled = matches!(style, TrayStyle::RingsFilled | TrayStyle::PulseFilled);
            let centre = at(&off, CENTER, CENTER).3;
            assert!(if filled { centre < 40 } else { centre == 255 }, "{style:?}: centre alpha {centre}");
        }
        // Cut-off wins whatever the severity says.
        assert_eq!(
            status_icon(Severity::Green, true, TrayStyle::Rings).rgba(),
            status_icon(Severity::Red, true, TrayStyle::Rings).rgba()
        );
    }

    /// `init_style` is what the redraw reads back.
    #[test]
    fn style_round_trips() {
        for style in STYLES {
            init_style(style);
            assert_eq!(current_style(), style);
        }
        init_style(TrayStyle::Rings);
    }

    /// The severity picks the colour, in both styles.
    #[test]
    fn severity_picks_the_colour() {
        let want = [COLOR_OK, COLOR_WARN, COLOR_ALARM];
        for style in STYLES {
            for (sev, color) in SEVERITIES.into_iter().zip(want) {
                let img = status_icon(sev, false, style);
                let opaque = img.rgba().chunks(4).find(|p| p[3] == 255).expect("an opaque pixel");
                assert_eq!((opaque[0], opaque[1], opaque[2]), color);
            }
        }
    }

    /// Every style × severity is a different picture, so shape alone tells states apart.
    #[test]
    fn every_state_looks_different() {
        let mut seen: Vec<Vec<u8>> = Vec::new();
        for style in STYLES {
            for (sev, cut_off) in [
                (Severity::Green, false),
                (Severity::Yellow, false),
                (Severity::Red, false),
                (Severity::Red, true),
            ] {
                let px = status_icon(sev, cut_off, style).rgba().to_vec();
                assert!(!seen.contains(&px), "{style:?} / {sev:?} / {cut_off} duplicates another icon");
                seen.push(px);
            }
        }
    }

    /// The breathing frame is grey and `pulse` scales its opacity.
    #[test]
    fn checking_frame_is_grey_and_dims() {
        for style in STYLES {
            let bright = checking_frame(style, 1.0);
            let dim = checking_frame(style, 0.5);
            let max_alpha = |i: &tauri::image::Image<'_>| i.rgba().chunks(4).map(|p| p[3]).max().unwrap();
            assert_eq!(max_alpha(&bright), 255);
            assert!((max_alpha(&dim) as i32 - 128).abs() <= 1);
            let p = bright.rgba().chunks(4).find(|p| p[3] == 255).unwrap();
            assert_eq!((p[0], p[1], p[2]), COLOR_CHECKING);
        }
    }

    /// Filled looks: a coloured rounded plate with the glyph cut out of it.
    #[test]
    fn filled_icons_are_a_plate_with_the_glyph_cut_out() {
        for style in [TrayStyle::RingsFilled, TrayStyle::PulseFilled] {
            let img = status_icon(Severity::Green, false, style);
            assert_eq!(at(&img, 0.2, 0.2).3, 0, "{style:?}: plate corners are rounded");
            // The plate's own edge is solid, in the mood colour.
            let (r, g, b, a) = at(&img, CENTER + 10.2, CENTER + 6.0);
            assert_eq!((r, g, b, a), (COLOR_OK.0, COLOR_OK.1, COLOR_OK.2, 255), "{style:?}");
            // Cut out of the plate: far fewer opaque pixels than a plain plate, but not none.
            let opaque = img.rgba().chunks(4).filter(|p| p[3] == 255).count();
            assert!(opaque > 800 && opaque < 1700, "{style:?}: {opaque} opaque px");
        }
        // Rings: the middle ring (r = 5) is a hole, the very centre is not.
        let rings = status_icon(Severity::Green, false, TrayStyle::RingsFilled);
        assert!(at(&rings, CENTER + 5.0, CENTER).3 < 80, "ring is cut out");
        assert_eq!(at(&rings, CENTER, CENTER).3, 255, "inside the innermost ring the plate stays");
        // Filled differs from bare, for the same picture.
        assert_ne!(
            status_icon(Severity::Red, true, TrayStyle::PulseFilled).rgba(),
            status_icon(Severity::Red, true, TrayStyle::Pulse).rgba()
        );
    }

    /// A list row's dot is a filled round dot in the status colour, with transparent corners.
    #[test]
    fn menu_dots_are_round_and_coloured() {
        for (dot, rgb) in [
            (Dot::Ok, COLOR_OK),
            (Dot::Warn, COLOR_WARN),
            (Dot::Alarm, COLOR_ALARM),
            (Dot::Offline, COLOR_OFFLINE),
            (Dot::Checking, COLOR_CHECKING),
        ] {
            let img = dot_icon(dot);
            assert_eq!((img.width(), img.height()), (44, 44));
            let (r, g, b, a) = at(&img, CENTER, CENTER);
            assert_eq!(((r, g, b), a), (rgb, 255), "{dot:?}");
            assert_eq!(at(&img, 0.2, 0.2).3, 0, "{dot:?}: corner empty");
            assert_eq!(at(&img, CENTER + 7.0, CENTER).3, 255, "{dot:?}: dot reaches r = 8");
            assert_eq!(at(&img, CENTER + 9.5, CENTER).3, 0, "{dot:?}: and stops there");
        }
    }

    /// Dev helper, not a check: `QANARY_DUMP_ICONS=/some/dir cargo test dump_icons` writes every
    /// icon as raw RGBA (`<style>-<mood>.rgba`, 44×44, moods ok/warn/alarm/offline/busy) so the art can be looked at.
    #[test]
    fn dump_icons() {
        let Ok(dir) = std::env::var("QANARY_DUMP_ICONS") else { return };
        for style in STYLES {
            for (name, sev, cut_off) in [
                ("ok", Severity::Green, false),
                ("warn", Severity::Yellow, false),
                ("alarm", Severity::Red, false),
                ("offline", Severity::Red, true),
            ] {
                let img = status_icon(sev, cut_off, style);
                std::fs::write(format!("{dir}/{style:?}-{name}.rgba"), img.rgba()).unwrap();
            }
            std::fs::write(format!("{dir}/{style:?}-busy.rgba"), checking_frame(style, 1.0).rgba()).unwrap();
        }
    }
}

/// Build and register the tray icon and its context menu.
///
/// Must be called once inside `setup()`, before the first `emit_checking`.
pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    // Starts with just the fixed actions; the list rows arrive with the first snapshot
    // (`refresh_menu`).
    let menu = build_menu(app, &[])?;

    TrayIconBuilder::with_id("main")
        .icon(status_icon(Severity::Green, false, current_style()))
        // macOS renders tray icons as monochrome template images by default, which
        // strips the colour. Keep our RGBA colours so the traffic-light reads.
        .icon_as_template(false)
        .menu(&menu)
        // macOS shows the menu on left-click by default; we want click = toggle window.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            ID_SHOW_HIDE => toggle_window(app),
            ID_REFRESH => {
                // Mirror the in-app refresh_now command: flash the checking state, then broadcast
                // "probe now" so every Service probe task (and the WAN task) wakes immediately.
                crate::emit_checking(app);
                let _ = app.state::<crate::state::AppState>().probe_now.send(());
            }
            ID_QUIT => app.exit(0),
            // A list row: bring the app up so the list can be looked at.
            id if id.starts_with(ID_LIST_PREFIX) => show_window(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Click fires for both press and release; handle only Up to avoid
            // toggling twice per click.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
