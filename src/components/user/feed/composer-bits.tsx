"use client";

import { cn } from "@/lib/utils";

export const COMPOSER_EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😎",
  "🤩", "😅", "😇", "🙂", "😉", "😌", "😴", "🤔",
  "😐", "🙃", "😭", "😡", "👍", "👎", "🙏", "👏",
  "🙌", "💪", "🤝", "✌️", "🤞", "👌", "🔥", "✨",
  "🎉", "🎊", "💯", "⚡", "🌟", "❤️", "🧡", "💛",
  "💚", "💙", "💜", "🖤", "💰", "💸", "🚀", "🏆",
];

export function ComposerToolBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "app-press app-tap inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50",
        active
          ? "bg-(--app-cta)/20 text-(--app-accent-ink)"
          : "text-(--app-ink-3) hover:text-(--app-ink) hover:bg-(--app-surface-2)"
      )}
    >
      {children}
    </button>
  );
}

export function EmojiPopover({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 max-w-[calc(100vw-2rem)] p-2 rounded-xl bg-(--app-surface) border border-(--app-line) shadow-xl grid grid-cols-8 gap-0.5 w-72">
        {COMPOSER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="app-press h-9 w-full text-xl leading-none rounded-md hover:bg-(--app-surface-2) flex items-center justify-center"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * A button in the selection format bar.
 *
 * Separate from `ComposerToolBtn` because it must NOT take focus:
 * `onMouseDown` + `preventDefault` keeps the textarea's selection alive, and
 * without that the click would blur the field, collapse the selection, and
 * `wrapSelection` would wrap nothing.
 */
export function SelectionFormatBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-md text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--app-surface-2) transition-colors"
    >
      {children}
    </button>
  );
}
