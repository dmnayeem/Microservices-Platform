"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Play, Loader2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

interface Lesson {
  id: string;
  title: string;
  durationMin?: number;
  videoUrl?: string;
  content?: string;
  completed?: boolean;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface CourseInfo {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  difficulty: string;
  duration: number;
}

interface CoursePlayerProps {
  course: CourseInfo;
  userId: string;
}

export function CoursePlayer({ course }: CoursePlayerProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [active, setActive] = useState<{ moduleId: string; lessonId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${course.id}/modules`)
      .then((r) => (r.ok ? r.json() : { modules: [] }))
      .then((d) => {
        setModules(d.modules ?? []);
        const first = d.modules?.[0]?.lessons?.[0];
        if (first) setActive({ moduleId: d.modules[0].id, lessonId: first.id });
      })
      .catch(() => setModules([]))
      .finally(() => setLoading(false));
  }, [course.id]);

  const total = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const done = modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => l.completed).length,
    0
  );
  const pct = total > 0 ? (done / total) * 100 : 0;

  const activeLesson = active
    ? modules
        .find((m) => m.id === active.moduleId)
        ?.lessons.find((l) => l.id === active.lessonId)
    : null;

  const completeLesson = async () => {
    if (!active) return;
    setMarking(true);
    try {
      const res = await fetch(
        `/api/courses/${course.id}/lessons/${active.lessonId}/complete`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(await res.text());
      setModules((mods) =>
        mods.map((m) =>
          m.id === active.moduleId
            ? {
                ...m,
                lessons: m.lessons.map((l) =>
                  l.id === active.lessonId ? { ...l, completed: true } : l
                ),
              }
            : m
        )
      );
      const willDone = done + 1 === total;
      if (willDone) setShowComplete(true);
      else toast.success("Lesson completed!");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-white">{course.title}</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {course.difficulty} · {course.duration} min · {done}/{total} lessons
        </p>
      </div>

      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-emerald-500 to-cyan-500 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>

      {activeLesson && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          {activeLesson.videoUrl && (
            <div className="aspect-video bg-black">
              <video
                src={activeLesson.videoUrl}
                controls
                className="w-full h-full"
              />
            </div>
          )}
          <div className="p-4">
            <p className="text-base font-semibold text-white mb-1">
              {activeLesson.title}
            </p>
            {activeLesson.content && (
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {activeLesson.content}
              </p>
            )}
            {!activeLesson.completed && (
              <button
                disabled={marking}
                onClick={completeLesson}
                className="mt-3 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {marking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Mark Complete
              </button>
            )}
            {activeLesson.completed && (
              <p className="mt-3 inline-flex items-center gap-1 text-sm text-emerald-400 font-semibold">
                <CheckCircle className="w-4 h-4" />
                Completed
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {modules.map((m) => (
          <div key={m.id} className="rounded-xl border border-gray-800 bg-gray-900">
            <div className="px-3 py-2 border-b border-gray-800">
              <p className="text-sm font-semibold text-white">{m.title}</p>
            </div>
            <ul>
              {m.lessons.map((l) => {
                const isActive =
                  active?.moduleId === m.id && active?.lessonId === l.id;
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => setActive({ moduleId: m.id, lessonId: l.id })}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-xs",
                        isActive ? "bg-indigo-500/10" : "hover:bg-gray-800/60"
                      )}
                    >
                      {l.completed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-gray-500" />
                      )}
                      <span className="flex-1 text-white">{l.title}</span>
                      {l.durationMin && (
                        <span className="text-gray-500">{l.durationMin}m</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {showComplete && (
        <div className="fixed inset-0 z-100 bg-black/80 flex items-center justify-center p-4">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 max-w-sm w-full text-center">
            <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white">Course Complete!</h2>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              You finished &quot;{course.title}&quot;
            </p>
            <button
              onClick={() => setShowComplete(false)}
              className="w-full py-2.5 rounded-lg bg-indigo-500 text-white font-bold"
            >
              Awesome
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
