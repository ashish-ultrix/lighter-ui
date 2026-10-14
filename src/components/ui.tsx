"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/** Static Figma SVGs live in /public/figma. Sizes come from each SVG's own width/height. */
export function Glyph({ name, className }: { name: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/figma/${name}.svg`} alt="" aria-hidden draggable={false} className={cn("block shrink-0 select-none", className)} />;
}

/** The glass card every terminal section sits in. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border-[0.5px] border-line bg-white/[0.05]", className)}>
      {children}
    </section>
  );
}

/** 28px square icon button used in the top nav. */
export function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="press hover-raise grid size-7 shrink-0 place-items-center rounded-[3px] bg-white/[0.05] shadow-[0_0_0_0.5px_black,inset_0_0.4px_0_rgb(255_255_255/0.08)]"
    >
      {children}
    </button>
  );
}

/** Close a popover on outside pointer-down or Escape. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Pill tabs: the active tab gets the glass fill, fading on colour only. */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<{ id: T; label: string; badge?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-[3.5px]", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "press h-[21px] shrink-0 whitespace-nowrap rounded px-2 text-[12px]",
            t.id === value
              ? "bg-white/[0.05] text-fg shadow-[0_0_0_0.5px_black,inset_0_0.4px_0_rgb(255_255_255/0.08)]"
              : "text-fg/80 hover-fg",
          )}
        >
          {t.label}
          {t.badge ? <span className="ml-1.5 text-faint">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

const SHEET_MS = 300;

/**
 * Bottom sheet. Enters and exits on transform only, with the iOS drawer curve;
 * a quick flick or a long drag down dismisses it.
 */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number } | null>(null);

  // Mount first, then flip to the open state two frames later so the transition has a start value.
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const id = setTimeout(() => {
      setEntered(false);
      setMounted(false);
    }, SHEET_MS);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;
  const visible = open && entered;

  function move(e: React.PointerEvent) {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${dy}px)`;
  }
  function end(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    const el = panel.current;
    if (!d || !el) return;
    const dy = Math.max(0, e.clientY - d.y);
    const velocity = dy / Math.max(1, Date.now() - d.t);
    el.style.transition = "";
    el.style.transform = "";
    if (dy > 120 || velocity > 0.11) onClose();
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/60 motion-reduce:transition-none"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms var(--ease-out)" }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 top-3 flex flex-col overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-panel shadow-2xl shadow-black motion-reduce:transition-none"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: `transform ${SHEET_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center py-2 active:cursor-grabbing"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, t: Date.now() };
            e.currentTarget.setPointerCapture(e.pointerId);
            if (panel.current) panel.current.style.transition = "none";
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-white/20" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

const TIP_W = 320;
const TIP_H = 120;

/**
 * Hover/focus explainer for a label. Rendered in a portal with fixed
 * positioning because every panel clips its overflow; flips above the label
 * when there is no room below (the orders strip sits at the screen bottom).
 */
export function Tooltip({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  const id = useId();
  const [at, setAt] = useState<{ x: number; y: number; above: boolean } | null>(null);

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const above = r.bottom + TIP_H + 12 > window.innerHeight;
    setAt({
      x: Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8)),
      y: above ? window.innerHeight - r.top + 6 : r.bottom + 6,
      above,
    });
  }

  return (
    <span
      tabIndex={0}
      aria-describedby={at ? id : undefined}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAt(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setAt(null)}
      onKeyDown={(e) => e.key === "Escape" && setAt(null)}
      className={cn("cursor-help underline decoration-fg/30 decoration-dotted underline-offset-4 outline-none", className)}
    >
      {children}
      {at &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            style={{ left: at.x, width: TIP_W, ...(at.above ? { bottom: at.y } : { top: at.y }) }}
            className="fade-in pointer-events-none fixed z-50 rounded-md border border-line-strong bg-raised px-3 py-2 text-[12px] normal-case leading-snug tracking-normal text-fg shadow-2xl shadow-black/60"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
