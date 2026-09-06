"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The like button. One tap, one heart.
 *
 * There used to be a five-emoji picker here, opened by hover on a pointer and
 * press-and-hold on touch. The owner had it removed: on the most-tapped control
 * in the feed, a gesture that can open something you did not ask for is a cost
 * paid on every single tap, and hold-to-open competes with the scroll that
 * starts the same way. Love is the only reaction now.
 *
 * The hit target is the point of the padding here. The action row styles its
 * DIRECT button children — and this component renders its own wrapper, so for
 * as long as that wrapper existed the like button inherited none of it and was
 * about 20x20px. That is why this one control in particular "needed pressing
 * twice". There is no wrapper any more and the padding is on the button.
 */
export function ReactionButton({
  reacted,
  disabled,
  onToggle,
}: {
  reacted: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const [bump, setBump] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setBump(true);
        setTimeout(() => setBump(false), 260);
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={reacted}
      aria-label={reacted ? "Remove your love" : "Love this post"}
      title={reacted ? "Loved" : "Love"}
      className={cn(
        // min-h/min-w rather than padding alone: the row is dense and a tap
        // target has to survive whatever the neighbouring content does to it.
        "inline-flex items-center justify-center gap-1.5 min-w-11 min-h-11 px-3 rounded-lg",
        "text-sm transition-colors touch-manipulation select-none",
        "hover:bg-gray-800/60 active:bg-gray-800",
        reacted ? "text-rose-400" : "text-gray-400 hover:text-rose-400"
      )}
    >
      <span
        className={cn(
          "inline-grid place-items-center w-5 h-5 transition-transform",
          bump && "animate-pop-in"
        )}
      >
        <Heart className={cn("w-5 h-5", reacted && "fill-current")} />
      </span>
    </button>
  );
}
