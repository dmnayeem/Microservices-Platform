"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, BookOpen, GripVertical } from "lucide-react";
import { toast } from "@/lib/toast";
import { UserUploadField } from "@/components/user/primitives/user-upload-field";

interface Lesson {
  id: string;
  title: string;
  videoUrl?: string;
  content?: string;
  durationMin?: number;
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

const cuid = () => Math.random().toString(36).slice(2, 11);

export function CourseCreator() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [category, setCategory] = useState("BUSINESS");
  const [difficulty, setDifficulty] = useState("BEGINNER");
  const [pointsReward, setPointsReward] = useState(100);
  const [modules, setModules] = useState<Module[]>([]);
  const [busy, setBusy] = useState(false);

  const addModule = () => {
    setModules([...modules, { id: cuid(), title: `Module ${modules.length + 1}`, lessons: [] }]);
  };

  const updateModule = (id: string, patch: Partial<Module>) => {
    setModules((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removeModule = (id: string) => {
    setModules((ms) => ms.filter((m) => m.id !== id));
  };

  const addLesson = (moduleId: string) => {
    setModules((ms) =>
      ms.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              lessons: [...m.lessons, { id: cuid(), title: `Lesson ${m.lessons.length + 1}` }],
            }
          : m
      )
    );
  };

  const updateLesson = (moduleId: string, lessonId: string, patch: Partial<Lesson>) => {
    setModules((ms) =>
      ms.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              lessons: m.lessons.map((l) =>
                l.id === lessonId ? { ...l, ...patch } : l
              ),
            }
          : m
      )
    );
  };

  const removeLesson = (moduleId: string, lessonId: string) => {
    setModules((ms) =>
      ms.map((m) =>
        m.id === moduleId
          ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }
          : m
      )
    );
  };

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description required");
      return;
    }
    if (modules.length === 0) {
      toast.error("Add at least one module");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          thumbnail,
          category,
          difficulty,
          pointsReward,
          modules,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      toast.success("Course created!");
      router.push(`/courses/${d.course.id}`);
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-indigo-400" /> Create Course
      </h1>

      <div className="card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Description *
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Thumbnail
          </label>
          <UserUploadField
            value={thumbnail}
            onChange={setThumbnail}
            folder="courses"
            previewSize="lg"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
            >
              <option>BUSINESS</option>
              <option>TECH</option>
              <option>FINANCE</option>
              <option>MARKETING</option>
              <option>OTHER</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Difficulty
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full px-2 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
            >
              <option>BEGINNER</option>
              <option>INTERMEDIATE</option>
              <option>ADVANCED</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Reward (pts)
            </label>
            <input
              type="number"
              min={0}
              value={pointsReward}
              onChange={(e) => setPointsReward(Number(e.target.value))}
              className="w-full px-2 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {modules.map((m, mi) => (
          <div
            key={m.id}
            className="card p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <GripVertical className="w-4 h-4 text-gray-500" />
              <input
                value={m.title}
                onChange={(e) => updateModule(m.id, { title: e.target.value })}
                className="flex-1 bg-transparent text-sm font-bold text-white focus:outline-none"
              />
              <span className="text-[10px] text-gray-500">M{mi + 1}</span>
              <button
                onClick={() => removeModule(m.id)}
                className="p-1 text-red-400 hover:bg-red-500/10 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5 ml-6">
              {m.lessons.map((l) => (
                <div
                  key={l.id}
                  className="rounded-lg bg-gray-950 border border-gray-800 p-2 space-y-1.5"
                >
                  <div className="flex items-center gap-1">
                    <input
                      value={l.title}
                      onChange={(e) =>
                        updateLesson(m.id, l.id, { title: e.target.value })
                      }
                      placeholder="Lesson title"
                      className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                    />
                    <button
                      onClick={() => removeLesson(m.id, l.id)}
                      className="p-0.5 text-gray-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    value={l.videoUrl ?? ""}
                    onChange={(e) =>
                      updateLesson(m.id, l.id, { videoUrl: e.target.value })
                    }
                    placeholder="Video URL (optional)"
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
                  />
                  <textarea
                    rows={2}
                    value={l.content ?? ""}
                    onChange={(e) =>
                      updateLesson(m.id, l.id, { content: e.target.value })
                    }
                    placeholder="Lesson notes/content (optional)"
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 resize-none focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
              <button
                onClick={() => addLesson(m.id)}
                className="w-full py-1.5 rounded-lg border border-dashed border-gray-700 text-xs text-gray-400 hover:text-indigo-400 hover:border-indigo-500/50"
              >
                + Add Lesson
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={addModule}
          className="w-full py-2.5 rounded-xl border border-dashed border-gray-700 text-sm text-gray-400 hover:text-indigo-400 hover:border-indigo-500/50 inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Module
        </button>
      </div>

      <button
        disabled={busy}
        onClick={submit}
        className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
        Publish Course
      </button>
    </div>
  );
}
