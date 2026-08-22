"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Edit3,
  Eye,
  Video,
  FileText,
  Brain,
  ClipboardList,
  Radio,
  Paperclip,
  Link as LinkIcon,
} from "lucide-react";
import type {
  BuilderState,
  BuilderModule,
  BuilderLesson,
  BuilderResource,
  CourseLessonType,
} from "../types";
import { makeEmptyLesson, makeEmptyModule } from "../types";
import { Field, SectionHeader, inputCls } from "../shared";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";

interface Props {
  state: BuilderState;
  update: <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => void;
}

const LESSON_TYPE_META: Record<
  CourseLessonType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  VIDEO: { label: "Video", icon: Video, tone: "text-indigo-300" },
  ARTICLE: { label: "Article", icon: FileText, tone: "text-emerald-300" },
  QUIZ: { label: "Quiz", icon: Brain, tone: "text-fuchsia-300" },
  ASSIGNMENT: { label: "Assignment", icon: ClipboardList, tone: "text-amber-300" },
  LIVE: { label: "Live class", icon: Radio, tone: "text-rose-300" },
  RESOURCE: { label: "Resource only", icon: Paperclip, tone: "text-cyan-300" },
};

export function CurriculumStep({ state, update }: Props) {
  const setModules = (modules: BuilderModule[]) => update("modules", modules);

  const addModule = () =>
    setModules([...state.modules, makeEmptyModule()]);

  const removeModule = (i: number) => {
    if (state.modules.length === 1) {
      setModules([makeEmptyModule()]);
      return;
    }
    setModules(state.modules.filter((_, idx) => idx !== i));
  };

  const moveModule = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= state.modules.length) return;
    const next = [...state.modules];
    [next[i], next[j]] = [next[j], next[i]];
    setModules(next);
  };

  const patchModule = (i: number, patch: Partial<BuilderModule>) => {
    setModules(
      state.modules.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Curriculum"
        subtitle="Group lessons into modules. Each lesson can be a video, article, quiz, assignment, live class or just a downloadable resource."
      />

      {state.modules.map((m, mi) => (
        <ModuleEditor
          key={mi}
          index={mi}
          module={m}
          isFirst={mi === 0}
          isLast={mi === state.modules.length - 1}
          onPatch={(patch) => patchModule(mi, patch)}
          onRemove={() => removeModule(mi)}
          onMove={(dir) => moveModule(mi, dir)}
        />
      ))}

      <button
        type="button"
        onClick={addModule}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-300 text-sm font-bold transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add module
      </button>
    </div>
  );
}

function ModuleEditor({
  index,
  module,
  isFirst,
  isLast,
  onPatch,
  onRemove,
  onMove,
}: {
  index: number;
  module: BuilderModule;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<BuilderModule>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const addLesson = () =>
    onPatch({ lessons: [...module.lessons, makeEmptyLesson()] });

  const removeLesson = (li: number) => {
    if (module.lessons.length === 1) {
      onPatch({ lessons: [makeEmptyLesson()] });
      return;
    }
    onPatch({ lessons: module.lessons.filter((_, idx) => idx !== li) });
  };

  const moveLesson = (li: number, dir: -1 | 1) => {
    const lj = li + dir;
    if (lj < 0 || lj >= module.lessons.length) return;
    const next = [...module.lessons];
    [next[li], next[lj]] = [next[lj], next[li]];
    onPatch({ lessons: next });
  };

  const patchLesson = (li: number, patch: Partial<BuilderLesson>) => {
    onPatch({
      lessons: module.lessons.map((l, idx) =>
        idx === li ? { ...l, ...patch } : l
      ),
    });
  };

  return (
    <div className="bg-slate-950 rounded-xl border border-slate-800">
      <div className="flex items-start gap-2 p-3 md:p-4 border-b border-slate-800">
        <div className="flex flex-col gap-1 mt-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
            Module {index + 1}
          </p>
          <input
            type="text"
            value={module.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className={inputCls}
            placeholder="Module title (e.g. Getting Started)"
          />
          <input
            type="text"
            value={module.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            className={inputCls + " mt-2"}
            placeholder="Optional one-line description"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-slate-500 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-slate-800"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg"
            title="Remove module"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-3 md:p-4 space-y-2">
          {module.lessons.map((l, li) => (
            <LessonEditor
              key={li}
              moduleIndex={index}
              lessonIndex={li}
              lesson={l}
              isFirst={li === 0}
              isLast={li === module.lessons.length - 1}
              onPatch={(patch) => patchLesson(li, patch)}
              onRemove={() => removeLesson(li)}
              onMove={(dir) => moveLesson(li, dir)}
            />
          ))}
          <button
            type="button"
            onClick={addLesson}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-700 hover:border-indigo-500 text-slate-500 hover:text-indigo-300 text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            Add lesson
          </button>
        </div>
      )}
    </div>
  );
}

function LessonEditor({
  moduleIndex,
  lessonIndex,
  lesson,
  isFirst,
  isLast,
  onPatch,
  onRemove,
  onMove,
}: {
  moduleIndex: number;
  lessonIndex: number;
  lesson: BuilderLesson;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<BuilderLesson>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = LESSON_TYPE_META[lesson.lessonType];
  const Icon = meta.icon;

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800">
      <div className="flex items-center gap-2 p-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            className="p-0.5 text-slate-500 hover:text-white disabled:opacity-20"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <span className="text-[10px] text-slate-500 font-mono w-12 shrink-0">
          {moduleIndex + 1}.{lessonIndex + 1}
        </span>
        <Icon className={`w-4 h-4 shrink-0 ${meta.tone}`} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 text-left text-sm text-white truncate hover:text-indigo-200"
        >
          {lesson.title || <span className="text-slate-500 italic">Untitled lesson</span>}
        </button>
        {lesson.duration > 0 && (
          <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
            {lesson.duration}m
          </span>
        )}
        {lesson.isPreview && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
            FREE
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-slate-500 hover:text-white p-1"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-400 hover:bg-rose-500/10 p-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="p-3 pt-0 space-y-3 border-t border-slate-800">
          <Field label="Lesson title" required>
            <input
              type="text"
              value={lesson.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              className={inputCls}
              placeholder="What's this lesson about?"
            />
          </Field>
          <Field label="Lesson type">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {(Object.keys(LESSON_TYPE_META) as CourseLessonType[]).map((t) => {
                const m = LESSON_TYPE_META[t];
                const TI = m.icon;
                const active = lesson.lessonType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPatch({ lessonType: t })}
                    className={
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border " +
                      (active
                        ? "border-indigo-500 bg-indigo-500/20 text-white"
                        : "border-slate-700 bg-slate-950 hover:bg-slate-800 text-slate-300")
                    }
                  >
                    <TI className={`w-3.5 h-3.5 ${active ? "" : m.tone}`} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Short description">
            <input
              type="text"
              value={lesson.description}
              onChange={(e) => onPatch({ description: e.target.value })}
              className={inputCls}
            />
          </Field>
          {(lesson.lessonType === "VIDEO" || lesson.lessonType === "LIVE") && (
            <Field label="Video" hint="Upload, or paste an MP4 / HLS / YouTube / Vimeo URL">
              <ImageUploadField
                value={lesson.videoUrl}
                onChange={(url) => onPatch({ videoUrl: url })}
                fileType="VIDEO"
                previewSize="md"
                urlPlaceholder="…or paste a video URL"
              />
            </Field>
          )}
          {lesson.lessonType === "VIDEO" && (
            <Field label="Subtitles" hint="Optional. .vtt format.">
              <ImageUploadField
                value={lesson.subtitlesUrl}
                onChange={(url) => onPatch({ subtitlesUrl: url })}
                fileType="DOCUMENT"
                previewSize="sm"
                urlPlaceholder="…or paste a .vtt URL"
              />
            </Field>
          )}
          {(lesson.lessonType === "ARTICLE" ||
            lesson.lessonType === "VIDEO" ||
            lesson.lessonType === "RESOURCE") && (
            <Field label="Body (Markdown)" hint="Lesson notes, transcript or instructions.">
              <textarea
                value={lesson.content}
                onChange={(e) => onPatch({ content: e.target.value })}
                rows={5}
                className={inputCls + " resize-y font-mono text-xs"}
                placeholder="Write the lesson body in Markdown…"
              />
            </Field>
          )}
          <ResourceList
            resources={lesson.resources}
            onChange={(r) => onPatch({ resources: r })}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Duration (min)">
              <input
                type="number"
                min={0}
                value={lesson.duration}
                onChange={(e) =>
                  onPatch({ duration: parseInt(e.target.value, 10) || 0 })
                }
                className={inputCls + " tabular-nums"}
              />
            </Field>
            <Field label="Free preview" hint="Available without enrolment">
              <label className="inline-flex items-center gap-2 text-sm text-slate-200 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lesson.isPreview}
                  onChange={(e) => onPatch({ isPreview: e.target.checked })}
                />
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                Free preview lesson
              </label>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceList({
  resources,
  onChange,
}: {
  resources: BuilderResource[];
  onChange: (next: BuilderResource[]) => void;
}) {
  const add = () => onChange([...resources, { label: "", url: "" }]);
  const remove = (i: number) => onChange(resources.filter((_, idx) => idx !== i));
  const patch = (i: number, p: Partial<BuilderResource>) =>
    onChange(resources.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  return (
    <Field label="Attached resources" hint="Downloadable files / external links">
      <div className="space-y-2">
        {resources.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={r.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              className={inputCls + " flex-1"}
              placeholder="Label (e.g. Cheatsheet PDF)"
            />
            <div className="flex-1">
              <ImageUploadField
                value={r.url}
                onChange={(url) => patch(i, { url })}
                fileType="DOCUMENT"
                previewSize="sm"
                urlPlaceholder="…or paste a file URL"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-rose-400 hover:bg-rose-500/10 p-1.5 rounded shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Add resource
        </button>
      </div>
    </Field>
  );
}
