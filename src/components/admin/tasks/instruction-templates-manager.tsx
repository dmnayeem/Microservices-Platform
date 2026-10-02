"use client";

/**
 * /admin/tasks/templates — list, search, filter, create, edit, duplicate,
 * delete instruction templates. The editor is the SAME rich editor the task
 * form uses for instructions, so a template looks exactly like it will in a
 * task.
 *
 * Queries: listing = 1 request (2 DB queries). Create / edit / duplicate /
 * delete = 1 write + 1 audit, then the list is refetched once.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Copy,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { isEmptyInstructionsHtml } from "@/lib/task-instructions";
import {
  STARTER_TEMPLATES,
  TEMPLATE_CATEGORY_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_TASK_TYPES,
  TEMPLATE_TASK_TYPE_LABEL,
  TEMPLATES_NOT_READY,
  templateSnippet,
  type InstructionTemplateRow,
  type TemplateListResponse,
} from "@/lib/instruction-templates";
import {
  CategoryChips,
  fetchTemplates,
  TaskTypeBadge,
  TemplateModal,
  TemplatePreview,
  useDebounced,
} from "./instruction-template-picker";

const RichTextEditor = dynamic(
  () => import("@/components/admin/offers/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-gray-700 bg-gray-950 min-h-48 animate-pulse" />
    ),
  }
);

interface Draft {
  id: string | null;
  name: string;
  category: string;
  taskType: string;
  contentHtml: string;
}

const inputCls =
  "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500";

export function InstructionTemplatesManager({
  canCreate,
  canManage,
}: {
  canCreate: boolean;
  canManage: boolean;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [taskType, setTaskType] = useState("");
  const [data, setData] = useState<TemplateListResponse | null>(null);
  const [rows, setRows] = useState<InstructionTemplateRow[]>([]);
  // `loadedKey` = the request the current data answers; loading is derived
  // (no setState at the top of the fetch effect).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [preview, setPreview] = useState<InstructionTemplateRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addingStarters, setAddingStarters] = useState(false);
  const dq = useDebounced(q.trim(), 300);
  const abortRef = useRef<AbortController | null>(null);

  // Any filter change starts again at page 1 — derived in the same render, so
  // a filter change is one request, not two.
  const filterKey = `${dq}|${category}|${taskType}`;
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;

  const requestKey = `${filterKey}|${page}|${reloadTick}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    fetchTemplates({ q: dq, category, taskType, page }, ac.signal)
      .then((d) => {
        setData(d);
        setRows((prev) => (page > 1 ? [...prev, ...d.templates] : d.templates));
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Couldn't load templates");
        setLoadedKey(requestKey);
      });
    return () => ac.abort();
  }, [dq, category, taskType, page, requestKey]);

  const reload = useCallback(() => {
    setPageState({ key: filterKey, page: 1 });
    setReloadTick((t) => t + 1);
  }, [filterKey]);

  const categories = data?.categories ?? [];
  const categoryNames = Array.from(
    new Set([...categories.map((c) => c.category), ...STARTER_TEMPLATES.map((s) => s.category)])
  );
  const totalTemplates = categories.reduce((s, c) => s + c.count, 0);
  const filtered = Boolean(dq || category || taskType);

  const openNew = () => {
    setDraft({ id: null, name: "", category: category || "", taskType: taskType || "", contentHtml: "" });
    setEditorKey((k) => k + 1);
  };
  const openEdit = (t: InstructionTemplateRow) => {
    setDraft({ id: t.id, name: t.name, category: t.category, taskType: t.taskType ?? "", contentHtml: t.contentHtml });
    setEditorKey((k) => k + 1);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.category.trim()) {
      toast.error("Name and category are required");
      return;
    }
    if (isEmptyInstructionsHtml(draft.contentHtml)) {
      toast.error("The template has no content");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/admin/task-templates/${draft.id}` : "/api/admin/task-templates",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            category: draft.category,
            taskType: draft.taskType || null,
            contentHtml: draft.contentHtml,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't save the template");
      toast.success(draft.id ? "Template updated" : "Template created");
      setDraft(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the template");
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async (t: InstructionTemplateRow) => {
    // Find a free "(copy)" name among what is loaded; the server's unique
    // index is the real guard (409 → toast).
    const names = new Set(rows.map((r) => r.name));
    let name = `${t.name} (copy)`.slice(0, TEMPLATE_NAME_MAX);
    for (let i = 2; names.has(name) && i < 50; i++) {
      name = `${t.name} (copy ${i})`.slice(0, TEMPLATE_NAME_MAX);
    }
    try {
      const res = await fetch("/api/admin/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: t.category,
          taskType: t.taskType,
          contentHtml: t.contentHtml,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't duplicate the template");
      toast.success("Template duplicated", { description: name });
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't duplicate the template");
    }
  };

  const remove = async (t: InstructionTemplateRow) => {
    const ok = await confirmDialog({
      title: `Delete "${t.name}"?`,
      description: "Tasks that already use it keep their own copy of the instructions.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/task-templates/${t.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't delete the template");
      toast.success("Template deleted");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the template");
    }
  };

  const addStarters = async () => {
    setAddingStarters(true);
    try {
      const res = await fetch("/api/admin/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starters: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't add the starter templates");
      toast.success(`Added ${body.count ?? 0} starter templates`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the starter templates");
    } finally {
      setAddingStarters(false);
    }
  };

  const notReady = data !== null && !data.ready;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/admin/tasks"
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors shrink-0"
            aria-label="Back to tasks"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
              <FileText className="w-6 h-6 text-red-400" /> Instruction Templates
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Reusable task instructions, by category. Pick one in the task form with
              &ldquo;Use a template&rdquo;, then edit it — the task keeps its own copy.
            </p>
          </div>
        </div>
        {canCreate && !notReady ? (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            <Plus className="w-4 h-4" /> New template
          </button>
        ) : null}
      </div>

      {notReady ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {TEMPLATES_NOT_READY}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, category or text…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className={`${inputCls} sm:w-48`}
              aria-label="Task type"
            >
              <option value="">All task types</option>
              {TEMPLATE_TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TEMPLATE_TASK_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <CategoryChips categories={categories} value={category} onChange={setCategory} />

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 px-6 py-12 text-center">
              {filtered && totalTemplates > 0 ? (
                <p className="text-sm text-gray-400">No templates match these filters.</p>
              ) : (
                <div className="space-y-3">
                  <FileText className="w-10 h-10 text-gray-600 mx-auto" />
                  <p className="text-white font-medium">No instruction templates yet</p>
                  <p className="text-sm text-gray-400 max-w-md mx-auto">
                    Write one with &ldquo;New template&rdquo;, or start from six ready-made
                    ones (Video, Article, Social, App install, Survey, Custom) and edit them.
                  </p>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={addStarters}
                      disabled={addingStarters}
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm font-medium text-white hover:border-gray-600 disabled:opacity-50"
                    >
                      {addingStarters ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-amber-400" />
                      )}
                      Add starter templates
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className={`grid gap-3 md:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
              {rows.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col rounded-xl border border-gray-800 bg-gray-900 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-white break-words min-w-0">{t.name}</p>
                    <span className="shrink-0 text-[11px] text-gray-500">
                      used {t.usageCount}×
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                      {t.category}
                    </span>
                    <TaskTypeBadge type={t.taskType} />
                  </div>
                  <p className="mt-2 flex-1 text-xs text-gray-400 line-clamp-3">
                    {templateSnippet(t.contentHtml, 220)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <ActionBtn onClick={() => setPreview(t)} icon={<Eye className="w-3.5 h-3.5" />}>
                      Preview
                    </ActionBtn>
                    {canManage ? (
                      <ActionBtn onClick={() => openEdit(t)} icon={<Pencil className="w-3.5 h-3.5" />}>
                        Edit
                      </ActionBtn>
                    ) : null}
                    {canCreate ? (
                      <ActionBtn onClick={() => duplicate(t)} icon={<Copy className="w-3.5 h-3.5" />}>
                        Duplicate
                      </ActionBtn>
                    ) : null}
                    {canManage ? (
                      <ActionBtn
                        onClick={() => remove(t)}
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        danger
                      >
                        Delete
                      </ActionBtn>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data?.hasMore ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPageState({ key: filterKey, page: page + 1 })}
                disabled={loading}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}

      <TemplateModal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ""}
      >
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                {preview.category}
              </span>
              <TaskTypeBadge type={preview.taskType} />
            </div>
            <TemplatePreview html={preview.contentHtml} />
          </div>
        ) : null}
      </TemplateModal>

      <TemplateModal
        open={draft !== null}
        onClose={() => (saving ? undefined : setDraft(null))}
        title={draft?.id ? "Edit template" : "New template"}
        wide
        footer={
          <>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {draft?.id ? "Save changes" : "Create template"}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  maxLength={TEMPLATE_NAME_MAX}
                  placeholder="e.g. YouTube subscribe + screenshot"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Category</label>
                <input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  maxLength={TEMPLATE_CATEGORY_MAX}
                  list="instruction-template-manager-categories"
                  placeholder="Pick one or type a new category"
                  className={inputCls}
                />
                <datalist id="instruction-template-manager-categories">
                  {categoryNames.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Task type</label>
                <select
                  value={draft.taskType}
                  onChange={(e) => setDraft({ ...draft, taskType: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Any type</option>
                  {TEMPLATE_TASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TEMPLATE_TASK_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Instructions</label>
              <RichTextEditor
                key={editorKey}
                value={draft.contentHtml}
                onChange={(html) => setDraft((d) => (d ? { ...d, contentHtml: html } : d))}
                minHeightClass="min-h-48"
              />
            </div>
          </div>
        ) : null}
      </TemplateModal>
    </div>
  );
}

function ActionBtn({
  onClick,
  icon,
  children,
  danger = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
        danger
          ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
          : "border-gray-700 text-gray-300 hover:bg-gray-800"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
