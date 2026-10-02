import { useCallback, useEffect, useRef } from "react";

/**
 * A text element that is cut off with an ellipsis scrolls to its end while the pointer is over its
 * container, then eases back. Used for long list names (the full name is also in the tooltip).
 *
 * Put `ref` on the clipped element and `onMouseEnter` / `onMouseLeave` on the container. The clipped
 * element's one child is the text run: that is what moves, with a transform. (Scrolling it with
 * `scrollLeft` stepped in whole pixels, which showed as jitter at this slow speed, and WebKit can
 * report a button's scroll width wider than its text, so the end of the glide was empty space. A
 * transform moves in sub-pixels, and the run's own width is exact.) Does nothing when the text fits,
 * or when the user asked for reduced motion.
 */
export function useHoverScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const raf = useRef(0);
  const finish = useRef(0);
  /** How far the text run is currently shifted left, in px. */
  const shift = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearTimeout(finish.current);
  }, []);

  const place = (run: HTMLElement, x: number) => {
    shift.current = x;
    run.style.transform = `translate3d(${-x}px, 0, 0)`;
  };

  /** Ease the text run's shift to `to` over `ms`. A timer lands it exactly even if frames are skipped. */
  const glide = useCallback(
    (run: HTMLElement, to: number, ms: number, done?: () => void) => {
      stop();
      const from = shift.current;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / ms);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        place(run, from + (to - from) * eased);
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
      finish.current = window.setTimeout(() => {
        cancelAnimationFrame(raf.current);
        place(run, to);
        done?.();
      }, ms + 30);
    },
    [stop],
  );

  const onMouseEnter = useCallback(() => {
    const el = ref.current;
    const run = el?.firstElementChild as HTMLElement | null;
    if (!el || !run || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const overflow = run.getBoundingClientRect().width - el.clientWidth;
    if (overflow <= 0) return;
    el.style.textOverflow = "clip"; // an ellipsis would ride along with the moving text
    run.style.display = "inline-block"; // a transform needs a box; it looks the same as the inline text
    glide(run, overflow, Math.max(900, overflow * 13));
  }, [glide]);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    const run = el?.firstElementChild as HTMLElement | null;
    if (!el || !run || (shift.current === 0 && el.style.textOverflow !== "clip")) return;
    glide(run, 0, 260, () => {
      run.style.transform = "";
      run.style.display = "";
      el.style.textOverflow = "";
    });
  }, [glide]);

  useEffect(() => stop, [stop]);

  return { ref, onMouseEnter, onMouseLeave };
}
