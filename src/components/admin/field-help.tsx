"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * ⓘ next to a form field: tap it to read what the field does and what
 * filling it in changes (owner, 2026-10-15). Click, not hover — it has to
 * work on a phone. Closes on a tap elsewhere or Escape.
 */
export function FieldHelp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => {
          // Inside a <label>: don't toggle its checkbox or focus its input.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="What is this?"
        aria-expanded={open}
        className="grid h-5 w-5 place-items-center rounded-full text-sky-400 hover:bg-sky-500/15 hover:text-sky-300"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-40 mt-1 w-72 max-w-[80vw] rounded-lg border border-sky-500/30 bg-slate-950 p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-2xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
