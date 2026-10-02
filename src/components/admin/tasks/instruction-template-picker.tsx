"use client";

/**
 * Instruction templates inside the task form: "Use a template" (searchable
 * picker) and "Save as template". Also exports the small pieces the
 * /admin/tasks/templates page reuses (modal shell, list fetcher, preview).
 *
 * Every list request is ONE GET (2 DB queries: the page + category counts).
 * Search is debounced and in-flight requests are aborted, so typing never
 * queues a request per keystroke. A missing table (migration not applied)
 * comes back as `ready: false` and shows a notice — the task form is never
 * blocked by this feature.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, X, FileText, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { isEmptyInstructionsHtml } from "@/lib/task-instructions";
import {
  STARTER_TEMPLATES,
  TEMPLATE_CATEGORY_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_TASK_TYPE_LABEL,
  TEMPLATES_NOT_READY,
  templateSnippet,
  type InstructionTemplateRow,
  type TemplateListResponse,
} from "@/lib/instruction-templates";

export interface TemplateQuery {
  q?: string;
  category?: string;
  taskType?: string;
  anyType?: boolean;
  page?: number;
}

export async function fetchTemplates(
  query: TemplateQuery,
  signal?: AbortSignal
): Promise<TemplateListResponse> {
  const sp = new URLSearchParams();
  if (query.q) sp.set("q", query.q);
  if (query.category) sp.set("category", query.category);
  if (query.taskType) sp.set("taskType", query.taskType);
  if (query.anyType) sp.set("anyType", "1");
  if (query.page && query.page > 1) sp.set("page", String(query.page));
  const res = await fetch(`/api/admin/task-templates?${sp.toString()}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Couldn't load templates");
  return data as TemplateListResponse;
}

/** Debounce a value (search box). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function TemplateModal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? "sm:max-w-4xl" : "sm:max-w-2xl"} max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <h3 className="text-base font-semibold text-white min-w-0 truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-800 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Rendered template body, same classes the task page renders instructions with. */
export function TemplatePreview({ html }: { html: string }) {
  return (
    <div
      className={`${OFFER_RICHTEXT_CLASS} text-sm rounded-lg border border-gray-800 bg-gray-950 p-3`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}

export function TaskTypeBadge({ type }: { type: string | null }) {
  return (
    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-300">
      {type ? TEMPLATE_TASK_TYPE_LABEL[type] ?? type : "Any type"}
    </span>
  );
}

/** Category chips with counts. "" = all. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: { category: string; count: number }[];
  value: string;
  onChange: (c: string) => void;
}) {
  if (categories.length === 0) return null;
  const total = categories.reduce((s, c) => s + c.count, 0);
  const chip = (key: string, label: string, count: number) => (
    <button
      key={key || "__all"}
      type="button"
      onClick={() => onChange(key)}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
        value === key
          ? "border-red-500 bg-red-500/15 text-white"
          : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
      }`}
    >
      {label} <span className="text-gray-500">{count}</span>
    </button>
  );
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {chip("", "All", total)}
      {categories.map((c) => chip(c.category, c.category, c.count))}
    </div>
  );
}

/**
 * "Use a template". `hasContent` = the editor already holds text, so the admin
 * chooses Replace or Append instead of silently losing their work.
 */
export function InstructionTemplatePicker({
  open,
  onClose,
  taskType,
  hasContent,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** The task's type; the list shows templates for it plus untyped ones. */
  taskType?: string;
  hasContent: boolean;
  onPick: (t: InstructionTemplateRow, mode: "replace" | "append") => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [onlyType, setOnlyType] = useState(true);
  const [data, setData] = useState<TemplateListResponse | null>(null);
  // Loading is derived: the data answers `loadedKey`, the screen wants `requestKey`.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 300);
  const abortRef = useRef<AbortController | null>(null);
  const requestKey = JSON.stringify([dq, category, onlyType, taskType ?? ""]);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    fetchTemplates(
      {
        q: dq,
        category,
        taskType: onlyType ? taskType : undefined,
        anyType: true,
      },
      ac.signal
    )
      .then((d) => {
        setData(d);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Couldn't load templates");
        setLoadedKey(requestKey);
      });
    return () => ac.abort();
  }, [open, dq, category, onlyType, taskType, requestKey]);

  const rows = data?.templates ?? [];

  return (
    <TemplateModal open={open} onClose={onClose} title="Use an instruction template" wide>
      {data && !data.ready ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {TEMPLATES_NOT_READY}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates by name or text…"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
            />
          </div>
          <CategoryChips
            categories={data?.categories ?? []}
            value={category}
            onChange={setCategory}
          />
          {taskType ? (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={onlyType}
                onChange={(e) => setOnlyType(e.target.checked)}
                className="accent-red-500"
              />
              Only {TEMPLATE_TASK_TYPE_LABEL[taskType] ?? taskType} templates (and ones for any type)
            </label>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {dq || category
                ? "No templates match."
                : "No templates yet. Add some on Tasks → Instruction Templates, or save this task's instructions as one."}
            </p>
          ) : (
            <ul className={`divide-y divide-gray-800 rounded-lg border border-gray-800 ${loading ? "opacity-60" : ""}`}>
              {rows.map((t) => (
                <li key={t.id} className="p-3 space-y-2">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white break-words">{t.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                          {t.category}
                        </span>
                        <TaskTypeBadge type={t.taskType} />
                        {t.usageCount > 0 ? (
                          <span className="text-[10px] text-gray-500">used {t.usageCount}×</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                        {templateSnippet(t.contentHtml)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewId(previewId === t.id ? null : t.id)}
                        className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                      >
                        {previewId === t.id ? "Hide" : "Preview"}
                      </button>
                      {hasContent ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onPick(t, "replace")}
                            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => onPick(t, "append")}
                            className="rounded-lg bg-gray-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-600"
                          >
                            Append
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPick(t, "replace")}
                          className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </div>
                  {previewId === t.id ? <TemplatePreview html={t.contentHtml} /> : null}
                </li>
              ))}
            </ul>
          )}
          {data?.hasMore ? (
            <p className="text-center text-[11px] text-gray-500">
              Showing the most-used matches — search to narrow down.
            </p>
          ) : null}
          {hasContent ? (
            <p className="text-[11px] text-gray-500">
              Replace swaps out what&apos;s in the editor; Append adds the template below it.
              The task keeps its own copy — edit it freely afterwards.
            </p>
          ) : null}
        </div>
      )}
    </TemplateModal>
  );
}

/** "Save as template": name + category (existing or new) for the editor's current content. */
export function SaveInstructionTemplateDialog({
  open,
  onClose,
  html,
  taskType,
}: {
  open: boolean;
  onClose: () => void;
  html: string;
  taskType?: string;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [tagType, setTagType] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notReady, setNotReady] = useState(false);

  // One list request on open, only for the category suggestions.
  useEffect(() => {
    if (!open) return;
    setName("");
    setNotReady(false);
    const ac = new AbortController();
    fetchTemplates({}, ac.signal)
      .then((d) => {
        if (!d.ready) setNotReady(true);
        setCategories(d.categories.map((c) => c.category));
      })
      .catch(() => {});
    return () => ac.abort();
  }, [open]);

  const suggestions = Array.from(
    new Set([...categories, ...STARTER_TEMPLATES.map((s) => s.category)])
  );

  const save = async () => {
    if (isEmptyInstructionsHtml(html)) {
      toast.error("Write some instructions first");
      return;
    }
    if (!name.trim() || !category.trim()) {
      toast.error("Name and category are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          taskType: tagType && taskType ? taskType : null,
          contentHtml: html,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't save the template");
      toast.success("Saved as template", { description: name.trim() });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TemplateModal
      open={open}
      onClose={onClose}
      title="Save instructions as a template"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || notReady}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save template
          </button>
        </>
      }
    >
      {notReady ? (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {TEMPLATES_NOT_READY}
        </p>
      ) : null}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Template name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={TEMPLATE_NAME_MAX}
            placeholder="e.g. YouTube subscribe + screenshot"
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={TEMPLATE_CATEGORY_MAX}
            list="instruction-template-categories"
            placeholder="Pick one or type a new category"
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
          />
          <datalist id="instruction-template-categories">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {suggestions.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    category === c
                      ? "border-red-500 bg-red-500/15 text-white"
                      : "border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {taskType ? (
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={tagType}
              onChange={(e) => setTagType(e.target.checked)}
              className="accent-red-500"
            />
            Tag as a {TEMPLATE_TASK_TYPE_LABEL[taskType] ?? taskType} template
          </label>
        ) : null}
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-400">
            <FileText className="w-4 h-4" /> Preview
          </p>
          <TemplatePreview html={html} />
        </div>
      </div>
    </TemplateModal>
  );
}
