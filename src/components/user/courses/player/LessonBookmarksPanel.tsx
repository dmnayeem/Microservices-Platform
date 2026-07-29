"use client";

import { useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import type { BookmarkEntry } from "./types";

interface Props {
  bookmarks: BookmarkEntry[];
  onChange: (next: BookmarkEntry[]) => void;
}

export function LessonBookmarksPanel({ bookmarks, onChange }: Props) {
  const [label, setLabel] = useState("");
  const [position, setPosition] = useState<number>(0);

  const add = () => {
    const b: BookmarkEntry = {
      id: crypto.randomUUID(),
      label: label.trim() || `Bookmark @ ${formatSeconds(position)}`,
      position: Math.max(0, Math.floor(position)),
      createdAt: new Date().toISOString(),
    };
    onChange([b, ...bookmarks]);
    setLabel("");
  };

  const remove = (id: string) =>
    onChange(bookmarks.filter((b) => b.id !== id));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="Label (optional)"
          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-500 uppercase font-bold">
            At
          </label>
          <input
            type="number"
            min={0}
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value, 10) || 0)}
            className="w-20 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-xs text-white tabular-nums"
          />
          <span className="text-[11px] text-gray-500">seconds</span>
          <button
            type="button"
            onClick={add}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            Bookmark
          </button>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Save a moment to jump back to it later."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {bookmarks.map((b) => (
            <li
              key={b.id}
              className="rounded-lg border border-gray-800 bg-gray-950 p-3 flex items-center gap-3"
            >
              <Bookmark className="w-4 h-4 text-amber-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{b.label}</p>
                <p className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                  @ {formatSeconds(b.position)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(b.id)}
                className="text-rose-400 hover:bg-rose-500/10 p-1 rounded shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
