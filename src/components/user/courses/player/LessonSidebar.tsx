"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Video,
  FileText,
  Brain,
  ClipboardList,
  Radio,
  Paperclip,
} from "lucide-react";
import type { PlayerModule } from "./types";

interface Props {
  modules: PlayerModule[];
  activeLessonId: string | null;
  onPick: (lessonId: string) => void;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  VIDEO: Video,
  ARTICLE: FileText,
  QUIZ: Brain,
  ASSIGNMENT: ClipboardList,
  LIVE: Radio,
  RESOURCE: Paperclip,
};

export function LessonSidebar({ modules, activeLessonId, onPick }: Props) {
  // Auto-open the module that contains the active lesson
  const initialOpenIds = new Set<string>();
  for (const m of modules) {
    if (m.lessons.some((l) => l.id === activeLessonId)) {
      initialOpenIds.add(m.id);
      break;
    }
  }
  // Default to opening the first if none matched
  if (initialOpenIds.size === 0 && modules.length > 0) {
    initialOpenIds.add(modules[0].id);
  }
  const [openIds, setOpenIds] = useState<Set<string>>(initialOpenIds);

  // Re-open module if active changes
  useEffect(() => {
    if (!activeLessonId) return;
    for (const m of modules) {
      if (m.lessons.some((l) => l.id === activeLessonId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOpenIds((prev) => {
          if (prev.has(m.id)) return prev;
          const next = new Set(prev);
          next.add(m.id);
          return next;
        });
        return;
      }
    }
  }, [activeLessonId, modules]);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside className="card overflow-hidden lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
      <div className="p-3 border-b border-gray-800">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Curriculum
        </p>
      </div>
      <ul className="divide-y divide-gray-800">
        {modules.map((m, mi) => {
          const open = openIds.has(m.id);
          const completed = m.lessons.filter((l) => l.progress?.isCompleted).length;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-800/40"
              >
                {open ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="text-[10px] text-gray-500 font-mono w-8 shrink-0">
                  S{mi + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">
                  {m.title}
                </span>
                <span className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
                  {completed}/{m.lessons.length}
                </span>
              </button>
              {open && (
                <ul className="bg-gray-950">
                  {m.lessons.map((l, li) => {
                    const Icon = ICONS[l.lessonType] ?? Video;
                    const active = l.id === activeLessonId;
                    const done = l.progress?.isCompleted ?? false;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => onPick(l.id)}
                          className={
                            "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors " +
                            (active
                              ? "bg-indigo-500/15 text-white"
                              : "text-gray-300 hover:bg-gray-800/40")
                          }
                        >
                          {done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-600 shrink-0" />
                          )}
                          <Icon
                            className={
                              "w-3.5 h-3.5 shrink-0 " +
                              (active ? "text-indigo-300" : "text-gray-500")
                            }
                          />
                          <span className="flex-1 min-w-0 truncate">
                            <span className="text-gray-500 font-mono text-[10px] mr-1">
                              {mi + 1}.{li + 1}
                            </span>
                            {l.title}
                          </span>
                          {l.duration > 0 && (
                            <span className="text-[10px] text-gray-500 tabular-nums">
                              {l.duration}m
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
