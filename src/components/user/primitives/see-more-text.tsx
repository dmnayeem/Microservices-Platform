"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CLAMP: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

/**
 * Plain text clamped to `lines` with a "See more" / "See less" toggle, shown
 * only when the text is actually cut — a short message renders with no button.
 * A notification can carry 500 characters; cut off with "…" the end of it was
 * simply unreadable where it was shown.
 *
 * `inLink`: the text sits inside a link (the bell menu rows). A <button> may
 * not live inside an <a>, so the toggle becomes a keyboard-reachable span that
 * stops the click from also following the link.
 */
export function SeeMoreText({
  text,
  lines = 4,
  className,
  inLink = false,
}: {
  text: string;
  lines?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  inLink?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const expandedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only measured while collapsed: then an overflow means hidden text. A
    // ResizeObserver rather than window resize, because a dropdown or card can
    // change width without the window doing so.
    const measure = () => {
      if (!ref.current || expandedRef.current) return;
      setNeedsToggle(ref.current.scrollHeight - ref.current.clientHeight > 1);
    };
    const t = setTimeout(measure, 0);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      clearTimeout(t);
      ro?.disconnect();
    };
  }, [text]);

  const toggle = (e: React.SyntheticEvent) => {
    if (inLink) {
      e.preventDefault();
      e.stopPropagation();
    }
    expandedRef.current = !expanded;
    setExpanded((v) => !v);
  };

  const label = expanded ? "See less" : "See more";
  const toggleCls =
    "mt-0.5 inline-flex min-h-8 items-center rounded-md text-sm font-semibold text-(--app-accent-ink) hover:underline cursor-pointer";

  return (
    <>
      <p ref={ref} className={cn("whitespace-pre-line wrap-break-word", className, !expanded && CLAMP[lines])}>
        {text}
      </p>
      {needsToggle &&
        (inLink ? (
          <span
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={toggle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggle(e);
            }}
            className={toggleCls}
          >
            {label}
          </span>
        ) : (
          <button type="button" aria-expanded={expanded} onClick={toggle} className={toggleCls}>
            {label}
          </button>
        ))}
    </>
  );
}
