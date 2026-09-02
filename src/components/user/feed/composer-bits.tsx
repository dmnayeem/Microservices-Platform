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
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-2 rounded-lg transition-colors disabled:opacity-50",
        active
          ? "bg-indigo-500/20 text-indigo-300"
          : "text-gray-400 hover:text-white hover:bg-gray-800"
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
      <div className="absolute left-0 top-full mt-1 z-50 w-64 max-w-[calc(100vw-2rem)] p-2 rounded-xl bg-gray-900 border border-gray-800 shadow-xl grid grid-cols-8 gap-0.5">
        {COMPOSER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="w-7 h-7 text-lg leading-none rounded hover:bg-gray-800 flex items-center justify-center"
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
      className="p-1.5 rounded-md text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
    >
      {children}
    </button>
  );
}
