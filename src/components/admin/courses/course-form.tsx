"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";

interface Lesson {
  title: string;
  description: string;
  videoUrl: string;
  content: string;
  duration: number;
  isFree: boolean;
}

const CATEGORIES = [
  "General",
  "Crypto",
  "Tech",
  "Marketing",
  "Finance",
  "Freelancing",
  "Passive Income",
  "E-commerce",
];

export function CourseForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [meta, setMeta] = useState({
    title: "",
    description: "",
    thumbnail: "",
    category: "General",
    difficulty: "BEGINNER" as "BEGINNER" | "INTERMEDIATE" | "ADVANCED",
    price: 0,
    isFree: true,
  });

  const [lessons, setLessons] = useState<Lesson[]>([
    {
      title: "",
      description: "",
      videoUrl: "",
      content: "",
      duration: 5,
      isFree: false,
    },
  ]);

  const [openLessonIdx, setOpenLessonIdx] = useState<number>(0);

  const addLesson = () => {
    setLessons((p) => [
      ...p,
      {
        title: "",
        description: "",
        videoUrl: "",
        content: "",
        duration: 5,
        isFree: false,
      },
    ]);
    setOpenLessonIdx(lessons.length);
  };

  const removeLesson = (i: number) => {
    setLessons((p) => p.filter((_, idx) => idx !== i));
  };

  const updateLesson = (i: number, patch: Partial<Lesson>) => {
    setLessons((p) =>
      p.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );
  };

  const submit = async (publish: boolean) => {
    if (!meta.title.trim() || !meta.description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    if (lessons.length === 0) {
      toast.error("Add at least one lesson");
      return;
    }
    for (const [i, l] of lessons.entries()) {
      if (!l.title.trim()) {
        toast.error(`Lesson ${i + 1}: title is required`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...meta,
          status: publish ? "PUBLISHED" : "DRAFT",
          lessons,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(publish ? "Course published" : "Saved as draft");
      router.push("/admin/courses");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Course meta */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Course Info</h2>
        <Field label="Title *">
          <input
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            className={inp}
            placeholder="e.g. Crypto Trading Fundamentals"
          />
        </Field>
        <Field label="Description *">
          <textarea
            rows={3}
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            className={inp + " resize-none"}
            placeholder="What will students learn?"
          />
        </Field>
        <Field label="Thumbnail">
          <ImageUploadField
            value={meta.thumbnail}
            onChange={(url) => setMeta({ ...meta, thumbnail: url })}
            title="Select Course Thumbnail"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Category">
            <select
              value={meta.category}
              onChange={(e) => setMeta({ ...meta, category: e.target.value })}
              className={inp}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              value={meta.difficulty}
              onChange={(e) =>
                setMeta({
                  ...meta,
                  difficulty: e.target.value as never,
                })
              }
              className={inp}
            >
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </Field>
          <Field label="Price">
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                step={0.01}
                value={meta.price}
                onChange={(e) =>
                  setMeta({ ...meta, price: parseFloat(e.target.value) || 0 })
                }
                disabled={meta.isFree}
                className={inp + " flex-1 disabled:opacity-50"}
                placeholder="0.00"
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-300 px-2">
                <input
                  type="checkbox"
                  checked={meta.isFree}
                  onChange={(e) =>
                    setMeta({ ...meta, isFree: e.target.checked, price: e.target.checked ? 0 : meta.price })
                  }
                  className="rounded bg-slate-800 border-slate-600 text-blue-500"
                />
                Free
              </label>
            </div>
          </Field>
        </div>
      </section>

      {/* Lessons */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Lessons ({lessons.length})
          </h2>
          <button
            onClick={addLesson}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Lesson
          </button>
        </div>
        <div className="space-y-3">
          {lessons.map((l, i) => {
            const isOpen = openLessonIdx === i;
            return (
              <div
                key={i}
                className="rounded-lg border border-slate-800 bg-slate-950/50"
              >
                <button
                  type="button"
                  onClick={() => setOpenLessonIdx(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 w-8">
                      #{i + 1}
                    </span>
                    <p className="text-white font-medium">
                      {l.title || `Lesson ${i + 1}`}
                    </p>
                    {l.duration > 0 && (
                      <span className="text-xs text-slate-500">
                        {l.duration} min
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {lessons.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeLesson(i);
                        }}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="p-4 pt-0 space-y-3 border-t border-slate-800">
                    <Field label="Lesson Title *">
                      <input
                        value={l.title}
                        onChange={(e) =>
                          updateLesson(i, { title: e.target.value })
                        }
                        className={inp}
                      />
                    </Field>
                    <Field label="Short Description">
                      <input
                        value={l.description}
                        onChange={(e) =>
                          updateLesson(i, { description: e.target.value })
                        }
                        className={inp}
                      />
                    </Field>
                    <Field label="Video URL (optional)">
                      <input
                        value={l.videoUrl}
                        onChange={(e) =>
                          updateLesson(i, { videoUrl: e.target.value })
                        }
                        className={inp}
                        placeholder="https://youtu.be/…"
                      />
                    </Field>
                    <Field label="Lesson Content (Markdown / HTML)">
                      <textarea
                        rows={6}
                        value={l.content}
                        onChange={(e) =>
                          updateLesson(i, { content: e.target.value })
                        }
                        className={inp + " resize-none font-mono text-xs"}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Duration (minutes)">
                        <input
                          type="number"
                          min={0}
                          value={l.duration}
                          onChange={(e) =>
                            updateLesson(i, {
                              duration: parseInt(e.target.value) || 0,
                            })
                          }
                          className={inp}
                        />
                      </Field>
                      <label className="flex items-center gap-2 px-3 py-2 mt-6">
                        <input
                          type="checkbox"
                          checked={l.isFree}
                          onChange={(e) =>
                            updateLesson(i, { isFree: e.target.checked })
                          }
                          className="rounded bg-slate-800 border-slate-600 text-blue-500"
                        />
                        <span className="text-sm text-slate-300">
                          Free preview lesson
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/admin/courses")}
          disabled={submitting}
          className="px-4 py-2 text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save as Draft
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Publish Course
          </button>
        </div>
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
