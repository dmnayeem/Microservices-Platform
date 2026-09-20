"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageZoomModalProps {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange?: (next: number) => void;
}

export function ImageZoomModal({
  open,
  images,
  index,
  onClose,
  onIndexChange,
}: ImageZoomModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onIndexChange && index > 0)
        onIndexChange(index - 1);
      if (e.key === "ArrowRight" && onIndexChange && index < images.length - 1)
        onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    // Restore whatever was there, not the empty string. Something else may be
    // holding the page still — a drawer, a sheet — and blanking the property
    // hands scrolling back while that thing is still open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, index, images.length, onClose, onIndexChange]);

  /**
   * Swipe down to dismiss.
   *
   * The page cannot scroll while this is open — that is the point of a
   * viewer — but on a phone the photo covers almost the whole screen, and
   * tapping it did nothing. So the two things a reader instinctively tries,
   * scrolling and tapping the picture, both appeared to do nothing, and the
   * app read as frozen. Dragging down is how every photo viewer they use
   * closes, and it is the gesture that is already in their fingers when
   * scrolling fails.
   */
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  // Whether a finger is down is something the render reads (to decide if the
  // photo should animate back or track the finger), so it is state, not a ref.
  const [dragging, setDragging] = useState(false);

  const endDrag = useCallback(() => {
    const dy = dragY;
    dragStart.current = null;
    setDragging(false);
    setDragY(0);
    // Far enough to be a decision rather than a stray finger.
    if (dy > 90) onClose();
  }, [dragY, onClose]);

  if (!open || images.length === 0) return null;
  const src = images[index];
  const hasNav = images.length > 1 && onIndexChange;
  return (
    <div
      className="fixed inset-0 z-100 bg-black/95 flex touch-none items-center justify-center p-4"
      onClick={onClose}
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        dragStart.current = e.touches[0].clientY;
        setDragging(true);
      }}
      onTouchMove={(e) => {
        if (dragStart.current == null) return;
        // Downward only. An upward drag is not a dismissal, and following it
        // would let the photo fly off the top of the screen.
        setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
      }}
      onTouchEnd={endDrag}
      onTouchCancel={endDrag}
    >
      <button
        onClick={onClose}
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      {hasNav && index > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          aria-label="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {hasNav && index < images.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          aria-label="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
      {/* The photo closes on tap, like every full-screen viewer people use.
          It used to swallow the tap with `stopPropagation`, which on a phone
          means the biggest target on the screen did nothing at all. The arrows
          keep their own `stopPropagation`, so paging is unaffected. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={onClose}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          opacity: dragY ? Math.max(0.35, 1 - dragY / 320) : undefined,
          // Track the finger with no transition; spring back once it lifts.
          transition: dragging ? undefined : "transform 180ms ease, opacity 180ms ease",
        }}
        className={cn(
          "max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        )}
      />
      {hasNav && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
