import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { DRAWER_MS, useCollapsible } from "./useCollapsible";

/** The hero's ☰ button. It opens a glass drawer to its left with Add list, Edit order and
 *  Settings: icons only, each named in a tip on hover or keyboard focus. */
export function HeroMenu({
  onAddList,
  onEditOrder,
  onOpenSettings,
  canEditOrder,
  editingOrder,
}: {
  onAddList: () => void;
  onEditOrder: () => void;
  onOpenSettings: () => void;
  canEditOrder: boolean;
  editingOrder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, anim } = useCollapsible(open, DRAWER_MS);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  // Nearest the ☰ first: that is the Tab order and the entrance order (the row is laid out
  // right to left).
  const actions = [
    { key: "add", label: "Add list", keys: "⌘N", icon: "plus", onClick: onAddList },
    {
      key: "order",
      label: "Edit order",
      keys: "⇧⌘O",
      icon: "order",
      onClick: onEditOrder,
      disabled: !canEditOrder,
      pressed: editingOrder,
    },
    { key: "settings", label: "Settings", keys: "⌘,", icon: "settings", onClick: onOpenSettings },
  ] as const;

  return (
    <div ref={wrapRef} className={`hero-menu${open ? " hero-menu-open" : ""}`}>
      <button
        ref={toggleRef}
        className="hero-btn hero-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={drawerId}
      >
        <svg className="hero-burger" viewBox="0 0 24 24" aria-hidden="true">
          <path className="hero-burger-top" d="M5 7h14" />
          <path className="hero-burger-mid" d="M5 12h14" />
          <path className="hero-burger-bot" d="M5 17h14" />
        </svg>
      </button>
      {mounted && (
        <div id={drawerId} className="hero-drawer" data-anim={anim} role="group" aria-label="App actions">
          {actions.map((a, i) => (
            <button
              key={a.key}
              className={`hero-drawer-btn hero-drawer-${a.key}`}
              style={{ "--i": i } as React.CSSProperties}
              onClick={() => run(a.onClick)}
              aria-label={a.label}
              disabled={"disabled" in a ? a.disabled : undefined}
              aria-pressed={"pressed" in a ? a.pressed : undefined}
            >
              <Icon name={a.icon} size={18} strokeWidth={1.8} />
              <span className="hero-tip" aria-hidden="true">
                {a.label}
                <kbd>{a.keys}</kbd>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
