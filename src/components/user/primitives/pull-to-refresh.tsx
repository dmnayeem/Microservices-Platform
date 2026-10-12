"use client";

import { useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 70; // px pull past which a release triggers refresh
const MAX = 110; // max visual pull distance

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  /** Disable on surfaces that shouldn't pull (e.g. inside a scroll container). */
  disabled?: boolean;
}

/**
 * Native-style pull-to-refresh for the window-scrolled mobile surfaces.
 * Pure touch events (no dependency). Only engages when the page is at the top
 * and the user drags down; snaps back on release and fires a success haptic.
 */
/** True when the touch began inside something that scrolls on its own and is
 *  not at its top — dragging down there scrolls that box, not the page. */
function insideScrolledBox(target: EventTarget | null, stop: HTMLElement) {
  let el = target instanceof Element ? target : null;
  while (el && el !== stop) {
    if (el.scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh({ onRefresh, children, disabled }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // State, not a ref: the transition below depends on it during render.
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Decided on the first move: a sideways swipe (a carousel, a chip strip)
  // must never turn into a refresh.
  const axis = useRef<"y" | "x" | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || refreshing) return;
    if (window.scrollY > 0) return; // only from the very top
    // React bubbles touches out of portals, so a bottom sheet or dialog opened
    // from a page reached this handler — dragging the sheet down pulled the
    // page behind it. Only touches that are really inside the page count.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (insideScrolledBox(e.target, e.currentTarget)) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = null;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging || !start.current || refreshing) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (axis.current === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis.current !== "y" || dy <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(MAX, dy * 0.5)); // resistance
  };

  const onTouchEnd = async () => {
    if (!dragging) return;
    setDragging(false);
    start.current = null;
    axis.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      haptic("light");
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
        haptic("success");
      }
    } else {
      setPull(0);
    }
  };

  const ready = pull >= THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Pull indicator — laid over the gap the content leaves as it slides.
          It used to sit in the flow AND the content was translated as well,
          so the page moved twice as far as the finger. The zero-height
          anchor keeps the wrapper itself unpositioned, so page content that
          is absolutely placed is not re-anchored to it. */}
      <div aria-hidden className="pointer-events-none relative h-0">
        <div
          className="absolute inset-x-0 top-0 flex items-end justify-center overflow-hidden"
          style={{ height: pull, opacity: Math.min(1, pull / THRESHOLD) }}
        >
          <div className="mb-2 w-9 h-9 rounded-full bg-(--app-surface) border border-(--app-line) flex items-center justify-center shadow-lg">
            {refreshing ? (
              <Loader2 className="w-4 h-4 text-(--app-accent-ink) animate-spin" />
            ) : (
              <ArrowDown
                className={`w-4 h-4 text-(--app-accent-ink) transition-transform ${ready ? "rotate-180" : ""}`}
              />
            )}
          </div>
        </div>
      </div>
      {/* Content — transform only while pulling so fixed overlays aren't re-anchored */}
      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
