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
export function PullToRefresh({ onRefresh, children, disabled }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    if (window.scrollY > 0) return; // only from the very top
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || startY.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(MAX, dy * 0.5)); // resistance
  };

  const onTouchEnd = async () => {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;
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
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Pull indicator */}
      <div
        className="pointer-events-none flex items-end justify-center overflow-hidden"
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
      {/* Content — transform only while pulling so fixed overlays aren't re-anchored */}
      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging.current ? "none" : "transform 0.2s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
