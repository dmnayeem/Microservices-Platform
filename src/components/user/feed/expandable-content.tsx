"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { RenderedContent } from "./feed-content";

/**
 * Post caption that clamps to 2 lines with a "See more" toggle. Measures the
 * clamped element once (after layout) to decide whether the toggle is needed, so
 * short captions render without a button. Links/hashtags/mentions still work via
 * RenderedContent.
 */
export function ExpandableContent({
  content,
  pClassName,
  wrapperClassName,
}: {
  content: string;
  /** Classes for the text paragraph. */
  pClassName?: string;
  /** Classes for the wrapper (e.g. margin). */
  wrapperClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const expandedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure after layout (and outside the effect body to satisfy
    // react-hooks/set-state-in-effect). Only while collapsed — then the
    // paragraph is line-clamped, so an overflow means there's hidden text worth
    // a toggle. Skip while expanded so a resize doesn't wipe the "See less".
    const measure = () => {
      if (!ref.current || expandedRef.current) return;
      setNeedsToggle(ref.current.scrollHeight - ref.current.clientHeight > 1);
    };
    const t = setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [content]);

  return (
    <div className={wrapperClassName}>
      <p
        ref={ref}
        className={cn("whitespace-pre-wrap", pClassName, !expanded && "line-clamp-2")}
      >
        <RenderedContent content={content} />
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => {
            expandedRef.current = !expanded;
            setExpanded((v) => !v);
          }}
          className="mt-0.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}
