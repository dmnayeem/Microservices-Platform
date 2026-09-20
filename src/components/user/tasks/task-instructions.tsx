"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  hasInstructions,
  isHtmlInstructions,
  legacySteps,
  sanitizeInstructionsHtml,
} from "@/lib/task-instructions";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";

/**
 * The instructions block, wherever a task is shown.
 *
 * One component for all five surfaces (social, article, manual, proxy, and the
 * admin detail page) because they were five copies of the same
 * `.split("\n").map(<li>)` and would otherwise have drifted the moment rich
 * text arrived at some of them and not others.
 *
 * Renders whichever shape is stored — see `lib/task-instructions`. Old tasks
 * keep the numbered steps they have always had; new ones get their formatting.
 *
 * Two presentation rules, both because these pages had become walls of text:
 *
 *  - **Steps are numbered rows, not a `list-decimal`.** A tight browser-default
 *    ordered list at 14px reads as a paragraph with digits in it. What a user
 *    scanning a task on a phone needs is to see "1", "2", "3" as separate
 *    things they do in order, which means giving each one a badge and real
 *    space. This is the "step 1 / step 2" the task pages were missing.
 *  - **Long instructions collapse.** Admins paste a lot. Six steps is a
 *    briefing; twenty is a document, and putting a document above the button
 *    the user came to press means they never reach the button.
 */

/** Beyond this many steps, collapse by default. */
const COLLAPSE_AFTER_STEPS = 6;
/** Beyond this much rich text, collapse by default. */
const COLLAPSE_HTML_CHARS = 900;

export function TaskInstructions({
  value,
  title = "Steps",
  className = "",
}: {
  value: string | null | undefined;
  title?: string | null;
  /**
   * Replaces the container classes rather than appending to them — the callers
   * do not agree on the surround (some use gray-900/p-4, some gray-950/p-3),
   * and appending would leave two competing background classes whose winner
   * depends on stylesheet order.
   */
  className?: string;
}) {
  const html = isHtmlInstructions(value);
  const steps = html ? [] : legacySteps(value);
  const long = html
    ? (value ?? "").length > COLLAPSE_HTML_CHARS
    : steps.length > COLLAPSE_AFTER_STEPS;

  const [open, setOpen] = useState(false);
  const collapsed = long && !open;

  if (!hasInstructions(value)) return null;

  const shown = collapsed ? steps.slice(0, COLLAPSE_AFTER_STEPS) : steps;

  return (
    <div
      className={
        className || "rounded-xl border border-(--app-line) bg-(--app-surface) p-4"
      }
    >
      {title && (
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-(--app-ink-3)">
          {title}
        </p>
      )}

      {html ? (
        <div className="relative">
          <div
            className={`${OFFER_RICHTEXT_CLASS} text-sm ${
              collapsed ? "max-h-64 overflow-hidden" : ""
            }`}
            // Sanitised immediately above. Staff-authored, but read by every
            // user, so it is treated as untrusted all the same.
            dangerouslySetInnerHTML={{
              __html: sanitizeInstructionsHtml(value as string),
            }}
          />
          {collapsed && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-gray-900 to-transparent" />
          )}
        </div>
      ) : (
        <ol className="space-y-2.5">
          {shown.map((line, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-(--app-accent-edge)/30 bg-(--app-cta)/10 text-[10px] font-bold tabular-nums text-(--app-accent-ink)">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-(--app-ink-2) wrap-break-word">
                {line}
              </span>
            </li>
          ))}
        </ol>
      )}

      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-ink-3) hover:text-white"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
          {open
            ? "Show less"
            : html
              ? "Read the full instructions"
              : `Show all ${steps.length} steps`}
        </button>
      )}
    </div>
  );
}
