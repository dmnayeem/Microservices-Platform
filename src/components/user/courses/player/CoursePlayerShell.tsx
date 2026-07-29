"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Menu,
  X,
  Award,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { LessonSidebar } from "./LessonSidebar";
import { LessonPane } from "./LessonPane";
import { EmptyState } from "@/components/user/primitives/empty-state";
import type { PlayerModule, PlayerLesson } from "./types";

interface Props {
  course: {
    id: string;
    slug: string | null;
    title: string;
    thumbnail: string | null;
    certificateEnabled: boolean;
    totalLessons: number;
    totalDuration: number;
  };
  enrollment: {
    id: string | null;
    progress: number;
    completedAt: Date | null;
  };
  modules: PlayerModule[];
  initialLessonId: string | null;
  viewerId: string;
}

export function CoursePlayerShell({
  course,
  enrollment,
  modules,
  initialLessonId,
}: Props) {
  const [modulesState, setModulesState] = useState(modules);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(initialLessonId);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const allLessons = useMemo(
    () => modulesState.flatMap((m) => m.lessons),
    [modulesState]
  );
  const activeLesson = useMemo(
    () => allLessons.find((l) => l.id === activeLessonId) ?? null,
    [allLessons, activeLessonId]
  );
  const activeIndex = activeLesson
    ? allLessons.findIndex((l) => l.id === activeLesson.id)
    : -1;

  const completedCount = allLessons.filter((l) => l.progress?.isCompleted).length;
  const progressPct =
    allLessons.length === 0
      ? 0
      : Math.round((completedCount / allLessons.length) * 100);

  const updateLessonProgress = useCallback(
    (lessonId: string, patch: Partial<PlayerLesson["progress"] & object>) => {
      setModulesState((prev) =>
        prev.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) =>
            l.id === lessonId
              ? {
                  ...l,
                  progress: {
                    watchedSeconds: 0,
                    totalSeconds: l.duration * 60,
                    lastPosition: 0,
                    isCompleted: false,
                    notes: null,
                    bookmarks: null,
                    ...(l.progress ?? {}),
                    ...patch,
                  },
                }
              : l
          ),
        }))
      );
    },
    []
  );

  const goNext = () => {
    if (activeIndex < 0 || activeIndex >= allLessons.length - 1) return;
    setActiveLessonId(allLessons[activeIndex + 1].id);
  };
  const goPrev = () => {
    if (activeIndex <= 0) return;
    setActiveLessonId(allLessons[activeIndex - 1].id);
  };

  const backHref = `/courses/${course.slug ?? course.id}`;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen((s) => !s)}
          className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:text-white"
          aria-label="Toggle curriculum"
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Course page
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{course.title}</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="w-3 h-3" />
              {completedCount} / {allLessons.length} lessons
            </span>
            <div className="h-1 flex-1 max-w-[160px] bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="tabular-nums">{progressPct}%</span>
          </div>
        </div>
        {enrollment.completedAt && course.certificateEnabled && (
          <Link
            href="/my-learning?tab=certificates"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-bold border border-emerald-500/30"
          >
            <Award className="w-3.5 h-3.5" />
            Certificate
          </Link>
        )}
      </div>

      <div
        className={
          "grid gap-3 " +
          (sidebarOpen
            ? "grid-cols-1 lg:grid-cols-[300px_1fr]"
            : "grid-cols-1")
        }
      >
        {sidebarOpen && (
          <LessonSidebar
            modules={modulesState}
            activeLessonId={activeLessonId}
            onPick={setActiveLessonId}
          />
        )}
        <div className="min-w-0">
          {activeLesson ? (
            <LessonPane
              key={activeLesson.id}
              courseId={course.id}
              lesson={activeLesson}
              hasPrev={activeIndex > 0}
              hasNext={activeIndex < allLessons.length - 1}
              onPrev={goPrev}
              onNext={goNext}
              onProgressChange={(patch) =>
                updateLessonProgress(activeLesson.id, patch)
              }
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="No lessons yet"
              description="The tutor hasn't published any lessons for this course."
            />
          )}
        </div>
      </div>
    </div>
  );
}
