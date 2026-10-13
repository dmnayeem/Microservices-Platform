"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

/**
 * "😀 Icons" next to a notification field: tap an icon and it goes in where
 * the cursor is (owner, 2026-10-13). Emoji, not images — they are the only
 * icons that show the same in the bell, a phone's push and an email.
 */
const GROUPS: { label: string; items: string[] }[] = [
  { label: "Popular", items: ["⚡", "🔥", "🎁", "💰", "💸", "✅", "⏰", "📢", "🎉", "⭐", "🚀", "👉", "✨", "🔔", "❤️", "👍"] },
  { label: "Money & rewards", items: ["💵", "💲", "🪙", "💎", "🏆", "🥇", "🎯", "📈", "🤑", "🧧", "🎫", "🛍️", "🏷️", "💳", "🏦", "📊"] },
  { label: "Alerts", items: ["⚠️", "❗", "‼️", "❓", "🚨", "⛔", "🛑", "🔴", "🟢", "🟡", "🔵", "📌", "📍", "🔒", "🔓", "🛡️"] },
  { label: "Time & events", items: ["⏳", "⌛", "🕒", "📅", "🗓️", "🎊", "🥳", "🎈", "🌙", "☀️", "🌟", "💫", "🆕", "🆓", "🔝", "🔜"] },
  { label: "Tasks & apps", items: ["📱", "💻", "📲", "📝", "📋", "🔗", "📷", "🎥", "▶️", "🎮", "📚", "🎓", "🧩", "🛠️", "📦", "🌐"] },
  { label: "People & hands", items: ["🙏", "👏", "🙌", "💪", "🤝", "👋", "😊", "😍", "🤩", "😎", "🥰", "😮", "👀", "💬", "🗣️", "👥"] },
  { label: "Arrows & marks", items: ["➡️", "⬅️", "⬆️", "⬇️", "↗️", "🔄", "✔️", "✖️", "➕", "➖", "💯", "🔟", "1️⃣", "2️⃣", "3️⃣", "▪️"] },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        // Keep the field's caret: a mousedown on the button would blur it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20"
      >
        <Smile className="h-3.5 w-3.5" /> Icons
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-[19rem] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-1.5">
              <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.items.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => onPick(e)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-slate-800"
                    aria-label={`Insert ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Put `text` where the field's caret is (or at the end), and return the new value + caret. */
export function insertAtCaret(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  text: string,
  max: number
): { value: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = (value.slice(0, start) + text + value.slice(end)).slice(0, max);
  return { value: next, caret: Math.min(next.length, start + text.length) };
}
