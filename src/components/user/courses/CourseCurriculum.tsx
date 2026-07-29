"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Video,
  FileText,
  Brain,
  ClipboardList,
  Radio,
  Paperclip,
  Lock,
  Eye,
  PlayCircle,
} from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  isPreview: boolean;
  lessonType: string;
  videoUrl: string | null;
}

interface ModuleBlock {
  id: string;
  title: string;
  description: string | null;
  lessons: Lesson[];
}

interface Props {
  courseId: string;
  modules: ModuleBlock[];
  isEnrolled: boolean;
  totalLessons: number;
  totalDuration: number;
}

const LESSON_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  VIDEO: { icon: Video, tone: "text-indigo-300" },
  ARTICLE: { icon: FileText, tone: "text-emerald-300" },
  QUIZ: { icon: Brain, tone: "text-fuchsia-300" },
  ASSIGNMENT: { icon: ClipboardList, tone: "text-amber-300" },
  LIVE: { icon: Radio, tone: "text-rose-300" },
  RESOURCE: { icon: Paperclip, tone: "text-cyan-300" },
};

export function CourseCurriculum({
  courseId,
  modules,
  isEnrolled,
  totalLessons,
  totalDuration,
}: Props) {
  // Open the first module by default
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(modules.slice(0, 1).map((m) => m.id)));
  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (modules.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="text-base font-bold text-white">Curriculum</h2>
        <p className="text-sm text-gray-400 mt-2">
          The tutor hasn&apos;t published any lessons yet.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white">Curriculum</h2>
        <p className="text-xs text-gray-500">
          {modules.length} sections · {totalLessons} lessons · {Math.round(totalDuration / 60)}h {totalDuration % 60}m
        </p>
      </div>
      <ul className="mt-4 space-y-2">
        {modules.map((m, mi) => {
          const open = openIds.has(m.id);
          const moduleDur = m.lessons.reduce((a, l) => a + (l.duration ?? 0), 0);
          return (
            <li
              key={m.id}
              className="rounded-xl border border-gray-800 bg-gray-950"
            >
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="w-full flex items-center gap-2 p-3 text-left"
              >
                {open ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="text-xs text-gray-500 font-mono w-10 shrink-0">
                  S{mi + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">
                  {m.title}
                </span>
                <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                  {m.lessons.length} lessons · {Math.round(moduleDur / 60) || moduleDur} min
                </span>
              </button>
              {open && (
                <ul className="border-t border-gray-800 divide-y divide-gray-800/60">
                  {m.lessons.map((l, li) => {
                    const meta = LESSON_ICONS[l.lessonType] ?? LESSON_ICONS.VIDEO;
                    const Icon = meta.icon;
                    const canPlay = isEnrolled || l.isPreview;
                    return (
                      <li
                        key={l.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-900/60"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${meta.tone}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            <span className="text-gray-500 font-mono text-xs mr-1">
                              {mi + 1}.{li + 1}
                            </span>
                            {l.title}
                          </p>
                          {l.description && (
                            <p className="text-[11px] text-gray-500 truncate">
                              {l.description}
                            </p>
                          )}
                        </div>
                        {l.duration > 0 && (
                          <span className="text-[11px] text-gray-500 tabular-nums whitespace-nowrap">
                            {l.duration}m
                          </span>
                        )}
                        {canPlay ? (
                          <Link
                            href={`/learn/${courseId}?lesson=${l.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/10"
                          >
                            {l.isPreview && !isEnrolled ? (
                              <>
                                <Eye className="w-3 h-3" /> Preview
                              </>
                            ) : (
                              <>
                                <PlayCircle className="w-3 h-3" /> Play
                              </>
                            )}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold text-gray-500">
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
