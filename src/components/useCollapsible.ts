import { useEffect, useRef, useState } from "react";

/** How long a collapse/expand animates. Keep in sync with `--collapse-ms` in App.css. */
export const COLLAPSE_MS = 300;

/** How long the hero ☰ drawer stays mounted to animate: its longest animation, the last
 *  action's staggered entrance (`.hero-drawer` in App.css). e2e 13 checks it covers them all. */
export const DRAWER_MS = 440;

/**
 * Keeps a collapsible body mounted while it animates, then unmounts it.
 *
 * `open` is the source of truth (it comes from the snapshot, so it survives remounts);
 * this hook only adds the animation: `anim` is "open" / "close" for the length of the
 * transition and "none" otherwise, and `mounted` is false once a closed body is gone
 * (a closed list renders no rows at all).
 */
export function useCollapsible(
  open: boolean,
  ms = COLLAPSE_MS,
): {
  mounted: boolean;
  anim: "none" | "open" | "close";
} {
  const [mounted, setMounted] = useState(open);
  const [anim, setAnim] = useState<"none" | "open" | "close">("none");
  const prev = useRef(open);

  useEffect(() => {
    if (prev.current === open) return; // first render, or nothing changed: no animation
    prev.current = open;
    setAnim(open ? "open" : "close");
    if (open) setMounted(true);
    const t = setTimeout(() => {
      setAnim("none");
      if (!open) setMounted(false);
    }, ms + 20);
    return () => clearTimeout(t);
  }, [open, ms]);

  return { mounted, anim };
}
