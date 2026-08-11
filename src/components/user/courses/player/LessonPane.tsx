"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Video,
  FileText,
  Brain,
  ClipboardList,
  Radio,
  Paperclip,
  StickyNote,
  Bookmark,
  Download,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { LessonVideoPlayer } from "./LessonVideoPlayer";
import { LessonNotesPanel } from "./LessonNotesPanel";
import { LessonBookmarksPanel } from "./LessonBookmarksPanel";
import { QuizPlayer } from "./QuizPlayer";
import { AssignmentSubmitter } from "./AssignmentSubmitter";
import { EmptyState } from "@/components/user/primitives/empty-state";
import type {
  PlayerLesson,
  PlayerLessonProgress,
  NoteEntry,
  BookmarkEntry,
} from "./types";

interface Props {
  courseId: string;
  lesson: PlayerLesson;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onProgressChange: (patch: Partial<PlayerLessonProgress>) => void;
}

type Tab = "overview" | "notes" | "bookmarks" | "resources";

export function LessonPane({
  courseId,
  lesson,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onProgressChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [completing, setCompleting] = useState(false);

  const isVideoLike =
    lesson.lessonType === "VIDEO" || lesson.lessonType === "LIVE";

  // Persist a progress patch to the server.
  const persist = async (patch: Partial<PlayerLessonProgress>) => {
    onProgressChange(patch);
    try {
      const res = await fetch(
        `/api/courses/${courseId}/lessons/${lesson.id}/progress`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // We don't toast for autosaves (would be too noisy). Only for completes.
      if (patch.isCompleted !== undefined) {
        toast.error("Couldn't save progress", {
          description: err instanceof Error ? err.message : "Try again",
        });
      }
    }
  };

  const markComplete = async () => {
    setCompleting(true);
    await persist({ isCompleted: true });
    toast.success("Lesson complete");
    setCompleting(false);
    if (hasNext) onNext();
  };

  const resources = Array.isArray(lesson.resources)
    ? (lesson.resources as Array<{ label: string; url: string; mimeType?: string }>)
    : [];

  const notes = Array.isArray(lesson.progress?.notes)
    ? (lesson.progress!.notes as NoteEntry[])
    : [];
  const bookmarks = Array.isArray(lesson.progress?.bookmarks)
    ? (lesson.progress!.bookmarks as BookmarkEntry[])
    : [];

  return (
    <div className="space-y-3">
      {/* Lesson hero */}
      {isVideoLike && lesson.hasVideo ? (
        <LessonVideoPlayer
          key={lesson.id}
          courseId={courseId}
          lessonId={lesson.id}
          subtitlesUrl={lesson.subtitlesUrl}
          initialPosition={lesson.progress?.lastPosition ?? 0}
          onPositionTick={(seconds) =>
            persist({ lastPosition: Math.floor(seconds) })
          }
          onDuration={(dur) => persist({ totalSeconds: Math.floor(dur) })}
          onWatched={(watched) => persist({ watchedSeconds: Math.floor(watched) })}
          onCrossed={() => {
            if (!lesson.progress?.isCompleted) persist({ isCompleted: true });
          }}
        />
      ) : lesson.lessonType === "QUIZ" && lesson.quizId ? (
        <QuizPlayer
          courseId={courseId}
          quizId={lesson.quizId}
          onPassed={() => persist({ isCompleted: true })}
        />
      ) : lesson.lessonType === "ASSIGNMENT" && lesson.assignmentId ? (
        <AssignmentSubmitter
          courseId={courseId}
          assignmentId={lesson.assignmentId}
          onSubmitted={() => persist({ isCompleted: true })}
        />
      ) : (
        <article className="card p-5">
          <LessonTypePill type={lesson.lessonType} />
          <h1 className="text-xl font-bold text-white mt-2">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-sm text-gray-400 mt-1">{lesson.description}</p>
          )}
          {lesson.content ? (
            <div className="prose prose-invert prose-sm max-w-none mt-4 whitespace-pre-wrap text-gray-200">
              {lesson.content}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic mt-4">
              No content for this lesson.
            </p>
          )}
        </article>
      )}

      {/* Lesson title + controls */}
      <div className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="min-w-0">
          <LessonTypePill type={lesson.lessonType} />
          <h2 className="text-base font-bold text-white mt-1 truncate">
            {lesson.title}
          </h2>
          {lesson.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
              {lesson.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold disabled:opacity-30"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          {!lesson.progress?.isCompleted ? (
            <button
              type="button"
              onClick={markComplete}
              disabled={completing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-50"
            >
              {completing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Mark complete
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-bold border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> Completed
            </span>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-30"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b border-gray-800 overflow-x-auto scrollbar-none">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={<FileText className="w-3.5 h-3.5" />}>
            Overview
          </TabButton>
          <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={<StickyNote className="w-3.5 h-3.5" />}>
            Notes ({notes.length})
          </TabButton>
          <TabButton active={tab === "bookmarks"} onClick={() => setTab("bookmarks")} icon={<Bookmark className="w-3.5 h-3.5" />}>
            Bookmarks ({bookmarks.length})
          </TabButton>
          <TabButton active={tab === "resources"} onClick={() => setTab("resources")} icon={<Download className="w-3.5 h-3.5" />}>
            Resources ({resources.length})
          </TabButton>
        </div>
        <div className="p-4">
          {tab === "overview" && (
            <div className="space-y-2 text-sm text-gray-300">
              {lesson.content ? (
                <div className="whitespace-pre-wrap">{lesson.content}</div>
              ) : (
                <p className="text-gray-500 italic">
                  No transcript or notes for this lesson.
                </p>
              )}
            </div>
          )}
          {tab === "notes" && (
            <LessonNotesPanel
              notes={notes}
              onChange={(next) => persist({ notes: next as unknown as object })}
            />
          )}
          {tab === "bookmarks" && (
            <LessonBookmarksPanel
              bookmarks={bookmarks}
              onChange={(next) =>
                persist({ bookmarks: next as unknown as object })
              }
            />
          )}
          {tab === "resources" && (
            <div className="space-y-1.5">
              {resources.length === 0 ? (
                <EmptyState
                  icon={Download}
                  title="No resources"
                  description="No downloadable resources for this lesson."
                  className="py-8"
                />
              ) : (
                resources.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-800 hover:border-indigo-500/40 text-sm text-gray-200"
                  >
                    <Download className="w-4 h-4 text-indigo-300" />
                    <span className="truncate flex-1">{r.label || r.url}</span>
                    {r.mimeType && (
                      <span className="text-[10px] text-gray-500 font-mono uppercase">
                        {r.mimeType}
                      </span>
                    )}
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px " +
        (active
          ? "border-indigo-500 text-white"
          : "border-transparent text-gray-400 hover:text-white")
      }
    >
      {icon}
      {children}
    </button>
  );
}

function LessonTypePill({ type }: { type: string }) {
  const meta: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; cls: string }> = {
    VIDEO: { icon: Video, label: "Video", cls: "bg-indigo-500/20 text-indigo-200" },
    ARTICLE: { icon: FileText, label: "Article", cls: "bg-emerald-500/20 text-emerald-200" },
    QUIZ: { icon: Brain, label: "Quiz", cls: "bg-fuchsia-500/20 text-fuchsia-200" },
    ASSIGNMENT: { icon: ClipboardList, label: "Assignment", cls: "bg-amber-500/20 text-amber-200" },
    LIVE: { icon: Radio, label: "Live class", cls: "bg-rose-500/20 text-rose-200" },
    RESOURCE: { icon: Paperclip, label: "Resource", cls: "bg-cyan-500/20 text-cyan-200" },
  };
  const m = meta[type] ?? meta.VIDEO;
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${m.cls}`}
    >
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}
