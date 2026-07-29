"use client";

import { useState } from "react";
import { Plus, Trash2, StickyNote } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import type { NoteEntry } from "./types";

interface Props {
  notes: NoteEntry[];
  onChange: (next: NoteEntry[]) => void;
}

export function LessonNotesPanel({ notes, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [position, setPosition] = useState<number>(0);

  const add = () => {
    if (!draft.trim()) return;
    const note: NoteEntry = {
      id: crypto.randomUUID(),
      body: draft.trim(),
      position: Math.max(0, Math.floor(position)),
      createdAt: new Date().toISOString(),
    };
    onChange([note, ...notes]);
    setDraft("");
  };

  const remove = (id: string) => onChange(notes.filter((n) => n.id !== id));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Take a note. Markdown is fine."
          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
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
            disabled={!draft.trim()}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-30"
          >
            <Plus className="w-3.5 h-3.5" />
            Add note
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          description="Jot down anything you want to remember."
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-gray-800 bg-gray-950 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">
                  @ {formatSeconds(n.position)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="text-rose-400 hover:bg-rose-500/10 p-1 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">
                {n.body}
              </p>
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
