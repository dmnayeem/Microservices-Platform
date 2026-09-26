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
        // `app-tap` rather than padding alone: the row is dense and a tap
        // target has to survive whatever the neighbouring content does to it.
        // It is on the button itself and not inherited from the row, which is
        // the whole history of this control.
        "shrink-0 app-tap app-press inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-(--app-r-chip)",
        "text-sm select-none hover:bg-(--app-surface-2)",
        // Rose is kept, and it is the ONE decorative hue left in the post card:
        // a heart that turns grey when you press it is not a heart. Everything
        // else in this row is neutral so that this is the only thing that
        // changes colour when you act.
        reacted ? "text-rose-400" : "text-(--app-ink-3) hover:text-rose-400"
      )}
    >
      <span
        className={cn(
          "inline-grid shrink-0 place-items-center w-5 h-5 transition-transform",
          bump && "animate-pop-in"
        )}
      >
        <Heart className={cn("w-5 h-5", reacted && "fill-current")} />
      </span>
    </button>
  );
}
