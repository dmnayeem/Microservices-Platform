"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollFadeRowProps {
  children: React.ReactNode;
  /** Classes for the outer relative wrapper. */
  className?: string;
  /** Classes for the scrollable track (flex row of chips/tabs/etc). */
  innerClassName?: string;
  /** Hide the left/right nudge buttons and only show the fade hint. */
  hideButtons?: boolean;
  ariaLabel?: string;
}

/**
 * Wraps a horizontally-scrolling row (filter chips, tabs, category pills)
 * with an edge fade + small scroll buttons that only appear when there is
 * actually more content off-screen. Native touch/trackpad scrolling and
 * keyboard focus-scroll both keep working — this only adds a visible hint
 * and an optional nudge.
 */
export function ScrollFadeRow({
  children,
  className,
  innerClassName,
  hideButtons,
  ariaLabel,
}: ScrollFadeRowProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update, children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.6, 120), behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={trackRef}
        role={ariaLabel ? "group" : undefined}
        aria-label={ariaLabel}
        className={cn("overflow-x-auto scrollbar-none", innerClassName)}
      >
        {children}
      </div>

      {canLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-gray-950 to-transparent" />
      )}
      {canRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-gray-950 to-transparent" />
      )}

      {!hideButtons && canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="hidden sm:flex absolute left-0.5 top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full bg-(--app-surface)/90 border border-(--app-line)/60 text-(--app-ink-2) shadow-md hover:text-white hover:bg-(--app-surface-2) z-10"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M12.5 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {!hideButtons && canRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="hidden sm:flex absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-full bg-(--app-surface)/90 border border-(--app-line)/60 text-(--app-ink-2) shadow-md hover:text-white hover:bg-(--app-surface-2) z-10"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M7.5 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
