"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REACTION,
  REACTIONS,
  reactionMeta,
  type ReactionType,
} from "@/lib/reactions";

/**
 * The like button, with a reaction picker.
 *
 * Tap still does exactly what it always did — toggle a plain 👍 — so the common
 * case is unchanged and one-handed. Press-and-hold (touch) or hover (pointer)
 * opens the picker for the other four.
 *
 * The picker is deliberately NOT a click-to-open menu: an extra tap on the most
 * used control in the feed is a real cost, and hold-to-choose is the gesture
 * people already have from other apps.
 */
export function ReactionButton({
  count,
  reacted,
  reaction,
  disabled,
  onToggle,
  onPick,
}: {
  count: number;
  reacted: boolean;
  reaction?: string | null;
  disabled?: boolean;
  /** Tap: add a default 👍, or remove whatever is there. */
  onToggle: () => void;
  /** Picker: set this specific reaction. */
  onPick: (type: ReactionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const meta = reactionMeta(reaction ?? DEFAULT_REACTION);
  const showEmoji = reacted && (reaction ?? DEFAULT_REACTION) !== DEFAULT_REACTION;

  const close = useCallback(() => setOpen(false), []);

  /**
   * Hover open/close, with a grace period.
   *
   * Closing the instant the pointer leaves made the picker unreachable: it sits
   * above the button, and a fast diagonal move to an emoji can clip outside the
   * wrapper for a frame. The padding trick below removes the dead zone; this
   * covers the rest.
   */
  const cancelClose = () => {
    if (closeRef.current) {
      clearTimeout(closeRef.current);
      closeRef.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    closeRef.current = setTimeout(() => setOpen(false), 180);
  };

  // Close on outside tap / Escape. Without this the picker survives a scroll on
  // touch, where there is no pointerleave to close it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (closeRef.current) clearTimeout(closeRef.current);
  }, []);

  const startHold = () => {
    heldRef.current = false;
    holdRef.current = setTimeout(() => {
      heldRef.current = true;
      setOpen(true);
    }, 320);
  };
  const endHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
  };

  const pick = (type: ReactionType) => {
    setOpen(false);
    setBump(true);
    setTimeout(() => setBump(false), 260);
    onPick(type);
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      // Hover opens on pointer devices; touch uses the hold timer above.
      onPointerEnter={(e) => e.pointerType === "mouse" && openNow()}
      onPointerLeave={(e) => e.pointerType === "mouse" && closeSoon()}
    >
      {open && (
        // The gap between the button and the emojis is PADDING on this
        // wrapper, not margin on the picker. With `mb-2` the 8px between them
        // belonged to nobody: the pointer left the wrapper on its way up and
        // the picker closed before it could be reached. As padding, the hover
        // region is continuous while the picker still floats clear.
        <div
          className="absolute bottom-full left-0 pb-2 z-30"
          onPointerEnter={openNow}
          onPointerLeave={closeSoon}
        >
        <div
          className="flex items-center gap-0.5 rounded-full border border-gray-700 bg-gray-900/95 backdrop-blur px-1.5 py-1 shadow-xl animate-pop-in"
          role="menu"
        >
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              role="menuitem"
              aria-label={r.label}
              title={r.label}
              onClick={() => pick(r.type)}
              className="w-9 h-9 grid place-items-center rounded-full text-xl leading-none transition-transform hover:scale-125 focus-visible:scale-125"
            >
              {r.emoji}
            </button>
          ))}
        </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          // A hold that opened the picker must not also toggle on release.
          if (heldRef.current) {
            heldRef.current = false;
            return;
          }
          setBump(true);
          setTimeout(() => setBump(false), 260);
          onToggle();
        }}
        onPointerDown={(e) => e.pointerType !== "mouse" && startHold()}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        disabled={disabled}
        aria-label={reacted ? `Reacted: ${meta.label}` : "Like"}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm transition-colors select-none",
          reacted ? meta.color : "text-gray-400 hover:text-rose-400"
        )}
      >
        <span
          className={cn(
            "inline-grid place-items-center w-5 h-5 transition-transform",
            bump && "animate-pop-in"
          )}
        >
          {showEmoji ? (
            <span className="text-base leading-none">{meta.emoji}</span>
          ) : (
            <Heart
              className={cn("w-4 h-4", reacted && "fill-current")}
            />
          )}
        </span>
        <span className="tabular-nums font-medium">{count}</span>
      </button>
    </div>
  );
}
