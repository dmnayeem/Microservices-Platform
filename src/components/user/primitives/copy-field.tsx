"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ChevronDown } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { notifyCenter } from "@/lib/notify-center";

/**
 * The copy affordances used by the social "recipe" — the numbered list of things
 * a user copies one by one and pastes into Pinterest / ChatGPT / Facebook.
 *
 * Two states, not one. The button used to set a single permanent `copied` flag,
 * which read as a BUG: the second click on a field produced no visible change at
 * all — same tick, same "Copied" label — so users reported that the buttons
 * "only work once". The copy itself always fired; nothing told them so.
 *
 * Now:
 *  - `flash` is per-click and fades. Every click gives feedback, every time,
 *    because re-copying is normal — a paste fails, or ChatGPT is restarted.
 *  - `everCopied` is permanent and quiet. Users leave the app, post, and come
 *    back; a marker for "you already took this one" is genuinely useful, which
 *    is why the old behaviour existed. It just cannot be the ONLY signal.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
  tone = "indigo",
}: {
  value: string;
  label?: string;
  className?: string;
  tone?: "indigo" | "emerald" | "purple";
}) {
  const [flash, setFlash] = useState(false);
  const [everCopied, setEverCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending timer must not fire into an unmounted component, and a rapid
  // second click must restart the flash rather than let the first one end it.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const toneClass =
    tone === "emerald"
      ? "text-emerald-400 hover:text-emerald-300"
      : tone === "purple"
        ? "text-purple-400 hover:text-purple-300"
        : "text-(--app-accent-ink) hover:text-(--app-accent-ink)";

  async function handle() {
    const ok = await copyText(value);
    if (!ok) {
      notifyCenter.error("Couldn't copy", "Select the text and copy it manually.");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setFlash(true);
    setEverCopied(true);
    timer.current = setTimeout(() => setFlash(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={everCopied ? `Copy ${label} again` : `Copy ${label}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
        flash
          ? "bg-emerald-500/20 text-emerald-300"
          : everCopied
            ? "text-emerald-400/70 hover:bg-white/5 hover:text-emerald-300"
            : `${toneClass} hover:bg-white/5`
      } ${className}`}
    >
      {flash || everCopied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {flash ? "Copied!" : everCopied ? "Copy again" : label}
    </button>
  );
}

/**
 * How much of a value to show before collapsing it.
 *
 * The AI image prompt on a Pinterest task is ~4,000 characters of instructions
 * written FOR ChatGPT, not for the person. Rendering it in full added several
 * thousand pixels to the page — one task page measured 6,267px tall — and
 * buried the thing the user actually has to do underneath it. Nobody reads it;
 * they copy it. So it is collapsed by default, with the full text one tap away.
 */
const COLLAPSE_CHARS = 260;
const COLLAPSE_LINES = 6;

function isLong(value: string): boolean {
  return (
    value.length > COLLAPSE_CHARS || value.split("\n").length > COLLAPSE_LINES
  );
}

/**
 * One numbered step of the recipe: a serial badge, the field's name, a Copy
 * button, and the value itself.
 */
export function CopyField({
  index,
  label,
  value,
  badge,
  children,
}: {
  /** 1-based serial shown to the user. Omit to render without a number. */
  index?: number;
  label: string;
  value: string;
  /** Small pill after the label, e.g. "AI". */
  badge?: React.ReactNode;
  /** Rendered under the value — extra actions or a hint. */
  children?: React.ReactNode;
}) {
  const long = isLong(value);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-(--app-line) bg-(--app-page) p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {index != null && (
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-(--app-accent-edge)/40 bg-(--app-cta)/15 text-[10px] font-bold text-(--app-accent-ink)">
              {index}
            </span>
          )}
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-(--app-ink-3)">
            {label}
          </p>
          {badge}
        </div>
        {/* The copy button always takes the FULL value, collapsed or not —
            collapsing is about reading, never about what gets copied. */}
        <CopyButton value={value} />
      </div>

      <div className="relative mt-1.5">
        <p
          className={`whitespace-pre-wrap wrap-break-word text-xs text-(--app-ink) ${
            long && !open ? "max-h-24 overflow-hidden" : ""
          }`}
        >
          {value}
        </p>
        {long && !open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-(--app-page) to-transparent" />
        )}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-ink-3) hover:text-white"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open
            ? "Show less"
            : `Show all (${value.length.toLocaleString()} characters)`}
        </button>
      )}

      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
