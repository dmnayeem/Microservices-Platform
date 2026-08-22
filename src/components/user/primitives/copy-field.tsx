"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { notifyCenter } from "@/lib/notify-center";

/**
 * The copy affordances used by the social "recipe" — the numbered list of things
 * a user copies one by one and pastes into Pinterest / Facebook / X.
 *
 * Two deliberate behaviours:
 *  - The tick is **persistent**. Users leave the app, post, and come back; a tick
 *    that faded after 1.5s tells them nothing about what they already copied.
 *  - Copying **never locks or advances** anything. Every field stays copyable for
 *    as long as the task is open, because people re-copy after a failed paste.
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
  const [copied, setCopied] = useState(false);

  const toneClass =
    tone === "emerald"
      ? "text-emerald-400 hover:text-emerald-300"
      : tone === "purple"
        ? "text-purple-400 hover:text-purple-300"
        : "text-indigo-400 hover:text-indigo-300";

  async function handle() {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      return;
    }
    notifyCenter.error(
      "Couldn't copy",
      "Select the text and copy it manually."
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
        copied ? "text-emerald-400" : toneClass
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
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
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {index != null && (
            <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold grid place-items-center">
              {index}
            </span>
          )}
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold truncate">
            {label}
          </p>
          {badge}
        </div>
        <CopyButton value={value} />
      </div>
      <p className="text-xs text-gray-200 whitespace-pre-wrap wrap-break-word">
        {value}
      </p>
      {children}
    </div>
  );
}
