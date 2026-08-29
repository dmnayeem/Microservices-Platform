"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { reactionBreakdown } from "@/lib/reactions";

/**
 * The reaction count, and the per-emoji breakdown behind it.
 *
 * The count used to live inside the like button, where the only thing it could
 * do was toggle a like. It sits on its own now, so tapping the number opens the
 * split — which reaction got how many — while the heart beside it still likes
 * in one tap. That split between "act" and "inspect" is how every other feed
 * works, and it is why the number had to come out of the button.
 *
 * Nothing is fetched. The counts arrive with the post already (`reactionCounts`
 * from `feed-post-shape.ts`), so the popover opens instantly and costs no
 * request. An earlier version of this showed the emojis inline above the action
 * row; the owner had it removed because it repeated the same number one line
 * below itself. Behind a tap it adds nothing to the resting card.
 */
export function ReactionBreakdown({
  count,
  counts,
}: {
  count: number;
  counts?: Record<string, number> | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Same dismissal contract as the reaction picker: outside pointer, or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to break down on a post nobody has reacted to — render the figure
  // as plain text so it does not offer a tap that opens an empty box.
  if (count <= 0) {
    return (
      <span className="text-sm tabular-nums font-medium text-gray-400 -ml-1 mr-1">
        0
      </span>
    );
  }

  const rows = reactionBreakdown(counts);

  return (
    <div ref={wrapRef} className="relative -ml-1 mr-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${count} reactions — see the breakdown`}
        className="text-sm tabular-nums font-medium text-gray-400 hover:text-white hover:underline underline-offset-2 transition-colors"
      >
        {count}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reaction breakdown"
          className="absolute bottom-full left-0 mb-2 z-30 w-44 rounded-xl border border-gray-700 bg-gray-900/95 backdrop-blur p-1.5 shadow-xl animate-pop-in"
        >
          <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-gray-800">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Reactions
            </span>
            {/* The headline figure, not the sum of the rows below: `likesCount`
                is the authoritative "people who reacted", and it is the number
                the reader just tapped. */}
            <span className="text-xs font-bold tabular-nums text-white">
              {count}
            </span>
          </div>
          <ul>
            {rows.map((r) => (
              <li
                key={r.type}
                className={cn(
                  "flex items-center gap-2 px-1.5 py-1 rounded-lg",
                  // Dim the ones nobody picked rather than hiding them, so the
                  // list keeps the same five rows on every post.
                  r.count === 0 && "opacity-40"
                )}
              >
                <span className="text-base leading-none">{r.emoji}</span>
                <span className="flex-1 text-xs text-gray-300">{r.label}</span>
                <span className="text-xs font-semibold tabular-nums text-white">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
