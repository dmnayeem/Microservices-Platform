"use client";

import { confirmDialog } from "@/lib/confirm";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Plus,
  X,
  Link as LinkIcon,
  Hash,
  KeyRound,
  AlertCircle,
  Layers,
  FileCode,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Loader2,
  Sparkles,
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  Palette,
  Eye,
  ExternalLink,
  Type,
} from "lucide-react";
import {
  type ArticleConfig,
  type ArticleLink,
  type ArticlePage,
  generateRandomArticleKey,
  sanitizePopupHtml,
  DEFAULT_POPUP_THEME,
} from "@/lib/article-tasks";
import { toast } from "@/lib/toast";

interface Props {
  value: ArticleConfig;
  onChange: (next: ArticleConfig) => void;
  /** Existing task id, if editing — required to manage the key pool. */
  taskId?: string;
  /**
   * Programmatic "save the parent task without redirecting" hook. When
   * the user clicks Step 1's "Save Pages & Continue" on a brand-new task
   * (no taskId yet), we call this to create the task in-place and get
   * back its new id, then advance the wizard. Without this, the user
   * would have to click the outer "Create Task" button first.
   *
   * `opts.isDraft` lets the wizard create the task as PAUSED (draft)
   * instead of ACTIVE — used by Step 1's "Save as Draft" button.
   */
  onSaveTask?: (opts?: { isDraft?: boolean }) => Promise<string | null>;
}

export function ArticleTaskBuilder({
  value,
  onChange,
  taskId,
  onSaveTask,
}: Props) {
  const useKeyPool = !!value.useKeyPool;

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={useKeyPool}
            onChange={(e) =>
              onChange({ ...value, useKeyPool: e.target.checked })
            }
            className="mt-1 rounded bg-gray-800 border-gray-600 text-indigo-500"
          />
          <div className="flex-1">
            <p className="text-sm font-bold text-white inline-flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Use multi-page Unique Key Pool (cross-domain embed)
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Recommended for new article tasks. Admin defines a list of
              article pages + a pool of one-time-use unique keys. The system
              generates HTML embed snippets the admin pastes onto each
              article page; popups appear in sequence and the final page
              gives the user a fresh key. Each key is used only once and is
              never reusable. Works on third-party domains.
            </p>
          </div>
        </label>
      </div>

      {useKeyPool ? (
        <KeyPoolMode
          value={value}
          onChange={onChange}
          taskId={taskId}
          onSaveTask={onSaveTask}
        />
      ) : (
        <LegacyMode value={value} onChange={onChange} />
      )}
    </div>
  );
}

// ───────────────────── Key-pool (v2) mode ─────────────────────

const STEPS = [
  { id: 0, label: "Pages", icon: LinkIcon },
  { id: 1, label: "Popup", icon: Sparkles },
  { id: 2, label: "Keys", icon: KeyRound },
  { id: 3, label: "Embed", icon: FileCode },
] as const;

function KeyPoolMode({ value, onChange, taskId, onSaveTask }: Props) {
  const [step, setStep] = useState(0);
  const [savingStep, setSavingStep] = useState<number | null>(null);
  // Snapshot of the articleConfig as it stood at the last successful
  // save. Drives the dirty/saved pill so the admin can tell when their
  // edits aren't yet persisted.
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(
    () => (taskId ? JSON.stringify(value) : null)
  );
  // Key-pool stats lifted up so Step 3's Continue button and Step 4's
  // Test button can gate on `unused > 0`.
  const [keyStats, setKeyStats] = useState<{ unused: number; total: number }>({
    unused: 0,
    total: 0,
  });
  const pages = value.pages ?? [];

  const isDirty = useMemo(
    () => lastSavedSnapshot !== null && JSON.stringify(value) !== lastSavedSnapshot,
    [value, lastSavedSnapshot]
  );

  /** PATCH a slice of articleConfig and (optionally) advance the wizard. */
  const patchConfig = useCallback(
    async (
      patch: Partial<ArticleConfig>,
      opts?: { advanceTo?: number; sourceStep: number; isDraft?: boolean }
    ): Promise<boolean> => {
      // First-time create flow: no taskId yet → call the parent's save
      // handler which submits the whole TaskForm, creates the task, and
      // returns the new id. The articleConfig (including this patch via
      // the live `value` state we already updated) gets persisted as part
      // of that single submit. Then we just advance the wizard.
      if (!taskId) {
        if (!onSaveTask) {
          toast.info(
            "Save the basic task details first using Create Task below."
          );
          return false;
        }
        // Apply the patch to local state so the parent picks up the
        // latest articleConfig before submitting.
        const merged = { ...value, ...patch };
        onChange(merged);
        setSavingStep(opts?.sourceStep ?? null);
        try {
          const newTaskId = await onSaveTask({ isDraft: opts?.isDraft });
          if (!newTaskId) {
            // Parent already surfaced the error via setError + toast — no
            // need to double-up.
            return false;
          }
          setLastSavedSnapshot(JSON.stringify(merged));
          toast.success(
            opts?.isDraft
              ? "Draft saved — keys & embed unlocked"
              : "Task created — keys & embed unlocked"
          );
          if (opts?.advanceTo !== undefined) setStep(opts.advanceTo);
          return true;
        } finally {
          setSavingStep(null);
        }
      }

      setSavingStep(opts?.sourceStep ?? null);
      try {
        const res = await fetch(
          `/api/admin/tasks/${taskId}/article-config`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        // Sync local state with the patch so subsequent edits see the saved values
        const merged = { ...value, ...patch };
        onChange(merged);
        setLastSavedSnapshot(JSON.stringify(merged));
        toast.success("Saved");
        if (opts?.advanceTo !== undefined) setStep(opts.advanceTo);
        return true;
      } catch (err) {
        toast.error("Save failed", {
          description: err instanceof Error ? err.message : String(err),
        });
        return false;
      } finally {
        setSavingStep(null);
      }
    },
    [taskId, value, onChange, onSaveTask]
  );

  return (
    <div className="space-y-5">
      <Stepper current={step} onJump={setStep} hasTask={!!taskId} />

      {/* Saved / unsaved pill. Only meaningful once a task id exists — for
          fresh forms the snapshot is null and we hide it. */}
      {taskId && lastSavedSnapshot !== null && (
        <div className="flex justify-end -mt-2">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 px-2.5 py-1 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 text-[11px] font-bold">
              <CheckCircle2 className="w-3 h-3" />
              All changes saved
            </span>
          )}
        </div>
      )}

      {!taskId && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-indigo-200 inline-flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Fill in the basic task details (title, description, points)
            above. Then add your pages below and click{" "}
            <strong>Save Pages &amp; Continue</strong> — that single click
            both creates the task <em>and</em> advances you to step 2.
          </span>
        </div>
      )}

      {step === 0 && (
        <PagesStep
          value={value}
          onChange={onChange}
          taskId={taskId}
          saving={savingStep === 0}
          onSaveAndContinue={() =>
            patchConfig(
              {
                useKeyPool: true,
                pages: (value.pages ?? []).filter((p) => p.url.trim()),
              },
              { sourceStep: 0, advanceTo: 1 }
            )
          }
          onSaveAsDraft={() =>
            patchConfig(
              {
                useKeyPool: true,
                pages: (value.pages ?? []).filter((p) => p.url.trim()),
              },
              { sourceStep: 0, advanceTo: 1, isDraft: true }
            )
          }
        />
      )}

      {step === 1 && (
        <PopupStep
          value={value}
          onChange={onChange}
          taskId={taskId}
          saving={savingStep === 1}
          onBack={() => setStep(0)}
          onSaveAndContinue={() =>
            patchConfig(
              {
                popupTitle: value.popupTitle,
                popupHtml: value.popupHtml,
                popupDelaySeconds: value.popupDelaySeconds,
                popupTextColor: value.popupTextColor,
                popupBgColor: value.popupBgColor,
                popupAccentColor: value.popupAccentColor,
                generateKeyButtonLabel: value.generateKeyButtonLabel,
                engagementMode: value.engagementMode ?? "natural",
                popupAfterClickMessage: value.popupAfterClickMessage,
              },
              { sourceStep: 1, advanceTo: 2 }
            )
          }
        />
      )}

      {step === 2 && (
        <KeysStep
          taskId={taskId}
          unusedKeyCount={keyStats.unused}
          onStatsChange={setKeyStats}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <EmbedStep
          taskId={taskId}
          pages={pages.filter((p) => p.url.trim())}
          unusedKeyCount={keyStats.unused}
          totalKeyCount={keyStats.total}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

// ───────────────────── Stepper ─────────────────────

function Stepper({
  current,
  onJump,
  hasTask,
}: {
  current: number;
  onJump: (i: number) => void;
  hasTask: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === current;
          const isDone = i < current;
          // Steps 2 & 3 (Keys, Embed) only become useful with a saved task
          const isDisabled = !hasTask && i >= 2;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                onClick={() => !isDisabled && onJump(i)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg flex-1 min-w-0 transition-colors ${
                  isActive
                    ? "bg-indigo-500/15 text-white"
                    : isDone
                    ? "text-emerald-400 hover:bg-gray-900"
                    : isDisabled
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:bg-gray-900 hover:text-white"
                }`}
              >
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    isActive
                      ? "bg-indigo-500 text-white"
                      : isDone
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-gray-800 text-gray-400 border border-gray-700"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className="text-xs font-semibold truncate inline-flex items-center gap-1.5">
                  <Icon className="w-3 h-3 shrink-0" />
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-3 sm:w-6 shrink-0 ${
                    isDone ? "bg-emerald-500/40" : "bg-gray-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────── Step 1 — Pages ─────────────────────

function PagesStep({
  value,
  onChange,
  taskId,
  saving,
  onSaveAndContinue,
  onSaveAsDraft,
}: {
  value: ArticleConfig;
  onChange: (next: ArticleConfig) => void;
  taskId?: string;
  saving: boolean;
  onSaveAndContinue: () => void;
  onSaveAsDraft: () => void;
}) {
  const pages = value.pages ?? [];

  /** Pre-flight validation — runs before either save button fires.
   *  Returns true if every page has a parsable URL and ≥1 popup text. */
  const validatePages = () => {
    const cleaned = pages.filter((p) => p.url.trim());
    if (cleaned.length === 0) {
      toast.error("Add at least one page URL.");
      return false;
    }
    for (let i = 0; i < cleaned.length; i++) {
      const p = cleaned[i];
      try {
        new URL(p.url);
      } catch {
        toast.error(`Page ${i + 1} URL is invalid`, {
          description: p.url,
        });
        return false;
      }
      const popupTexts = (p.popups ?? []).filter((x) => x.text.trim());
      if (popupTexts.length === 0) {
        toast.error(`Page ${i + 1} needs at least 1 popup text`, {
          description:
            "Add a clickable line in the Popup Texts editor below the page.",
        });
        return false;
      }
    }
    return true;
  };

  const handleSaveAndContinue = () => {
    if (!validatePages()) return;
    onSaveAndContinue();
  };
  const handleSaveAsDraft = () => {
    if (!validatePages()) return;
    onSaveAsDraft();
  };

  const updatePage = (idx: number, patch: Partial<ArticlePage>) => {
    const next = [...pages];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...value, pages: next });
  };
  const addPage = () => {
    onChange({
      ...value,
      pages: [...pages, { url: "", label: "", popupCount: 2 }],
    });
  };
  const removePage = (idx: number) => {
    onChange({ ...value, pages: pages.filter((_, i) => i !== idx) });
  };

  const validCount = pages.filter((p) => p.url.trim()).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-bold text-white inline-flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-indigo-400" />
            Step 1 — Article Pages
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Ordered list of pages the user must visit. The last page is where
            the unique key is generated.
          </p>
        </div>
        <button
          type="button"
          onClick={addPage}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Page
        </button>
      </div>

      {pages.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-6 text-center text-sm text-gray-500">
          No pages yet. Click <strong>Add Page</strong> to start.
        </div>
      )}

      <div className="space-y-2">
        {pages.map((p, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono shrink-0">
                Page {idx + 1}
                {idx === pages.length - 1 && pages.length > 1 && (
                  <span className="ml-1 text-amber-400">(final)</span>
                )}
              </span>
              <input
                type="url"
                value={p.url}
                onChange={(e) => updatePage(idx, { url: e.target.value })}
                placeholder="https://your-article-site.com/page-1"
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => removePage(idx)}
                className="p-2 text-gray-500 hover:text-red-400"
                title="Remove page"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={p.label ?? ""}
              onChange={(e) => updatePage(idx, { label: e.target.value })}
              placeholder="Label (optional)"
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />

            {/* v3.2 — simplified per-page knobs. Just two: scroll & timing.
                Min Dwell auto-derives on the server from interval × clicks.
                First Popup Delay auto-equals the interval. */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Scroll Required (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={p.minScrollPercent ?? 60}
                  onChange={(e) =>
                    updatePage(idx, {
                      minScrollPercent: parseInt(e.target.value) || 0,
                    })
                  }
                  className="px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  title="User must scroll to this % of page height before clicks count"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Popup Interval (sec)
                </span>
                <input
                  type="number"
                  min={3}
                  max={600}
                  value={p.popupIntervalSeconds ?? 15}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0;
                    updatePage(idx, {
                      popupIntervalSeconds: v,
                      // Reset stale legacy first-delay so the auto-equals
                      // logic kicks in next time the embed-config runs.
                      firstPopupDelaySeconds: undefined,
                    });
                  }}
                  className="px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  title="Seconds of dwell before the first popup, AND between subsequent popups"
                />
              </label>
              <label className="flex flex-col gap-0.5 col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Total Clicks Needed
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={
                    p.popupClickCount ??
                    (p.popups ? p.popups.filter((x) => x.text.trim()).length : 0) ??
                    0
                  }
                  onChange={(e) =>
                    updatePage(idx, {
                      popupClickCount: parseInt(e.target.value) || 1,
                    })
                  }
                  className="px-2 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-xs text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  title="Total popups the user must click on this page. If higher than the number of texts below, the texts cycle to fill it."
                />
                <span className="text-[10px] text-gray-500 mt-0.5">
                  If &gt; number of Popup Texts, the texts cycle. E.g. 2
                  texts + 5 clicks = user sees text-1 → text-2 → text-1 →
                  text-2 → text-1.
                </span>
              </label>
            </div>

            <PopupTextsEditor
              popups={p.popups ?? []}
              onChange={(next) => updatePage(idx, { popups: next })}
            />
            <p className="text-[10px] text-gray-500 italic px-1 -mt-1">
              ⓘ Each text is a content prompt. Never tell users to click an
              ad — forced ad-clicks violate AdSense ToS and get publishers
              banned.
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end items-center gap-2 pt-2">
        {!taskId && (
          <button
            type="button"
            onClick={handleSaveAsDraft}
            disabled={saving || validCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-semibold disabled:opacity-50"
            title="Create the task as a draft (PAUSED) without publishing it"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save as Draft
          </button>
        )}
        <button
          type="button"
          onClick={handleSaveAndContinue}
          disabled={saving || validCount === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
          title={
            validCount === 0
              ? "Add at least one page URL"
              : !taskId
              ? "Will create the task and continue to step 2"
              : ""
          }
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Pages &amp; Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ───────────────────── Per-page popup texts sub-editor ─────────────────────

type PopupTextItem = {
  text: string;
  textColor?: string;
  highlightColor?: string;
  position?:
    | "top"
    | "quarter"
    | "middle"
    | "three-quarter"
    | "bottom"
    | "random";
  delaySeconds?: number;
};

const POSITION_OPTIONS: Array<{
  value: NonNullable<PopupTextItem["position"]>;
  label: string;
}> = [
  { value: "random", label: "Random (auto)" },
  { value: "top", label: "Top of article" },
  { value: "quarter", label: "Quarter (~25%)" },
  { value: "middle", label: "Middle (~50%)" },
  { value: "three-quarter", label: "Three-quarter (~75%)" },
  { value: "bottom", label: "Bottom of article" },
];

function PopupTextsEditor({
  popups,
  onChange,
}: {
  popups: Array<PopupTextItem>;
  onChange: (next: Array<PopupTextItem>) => void;
}) {
  const addItem = () => {
    onChange([
      ...popups,
      {
        text: "",
        textColor: DEFAULT_POPUP_THEME.textColor,
        highlightColor: "",
        position: "random",
      },
    ]);
  };
  const updateItem = (i: number, patch: Partial<PopupTextItem>) => {
    const next = [...popups];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const removeItem = (i: number) => {
    onChange(popups.filter((_, idx) => idx !== i));
  };

  return (
    <div className="rounded-md border border-gray-800 bg-gray-900/40 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-300 inline-flex items-center gap-1.5">
          <Type className="w-3 h-3 text-indigo-400" />
          Popup Texts ({popups.length})
        </p>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Plus className="w-3 h-3" />
          Add Text
        </button>
      </div>

      {popups.length === 0 && (
        <p className="text-[11px] text-gray-500 italic px-1">
          No popup texts yet. Each text shows as a clickable line on the
          article page; the user must click each one to advance.
        </p>
      )}

      {popups.map((p, i) => (
        <div
          key={i}
          className="rounded bg-gray-950 border border-gray-800 p-2 space-y-1.5"
        >
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] text-gray-500 font-mono mt-2 shrink-0">
              {i + 1}.
            </span>
            <input
              type="text"
              value={p.text}
              onChange={(e) => updateItem(i, { text: e.target.value })}
              placeholder='e.g. "Read this content everyday"'
              className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="p-1 text-gray-500 hover:text-red-400 mt-1"
              title="Remove text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 ml-5">
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-500 shrink-0">Text:</label>
              <input
                type="color"
                value={p.textColor || DEFAULT_POPUP_THEME.textColor}
                onChange={(e) => updateItem(i, { textColor: e.target.value })}
                className="w-7 h-7 rounded border border-gray-700 bg-gray-900 cursor-pointer"
                title="Text color"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-gray-500 shrink-0">Highlight:</label>
              <input
                type="color"
                value={p.highlightColor || "#1e293b"}
                onChange={(e) => updateItem(i, { highlightColor: e.target.value })}
                className="w-7 h-7 rounded border border-gray-700 bg-gray-900 cursor-pointer"
                title="Background highlight color"
              />
              {p.highlightColor && (
                <button
                  type="button"
                  onClick={() => updateItem(i, { highlightColor: "" })}
                  className="text-[10px] text-gray-500 hover:text-gray-300 underline"
                  title="Remove highlight"
                >
                  clear
                </button>
              )}
            </div>
            {/* Preview chip */}
            {p.text.trim() && (
              <span
                className="ml-auto px-2 py-0.5 rounded text-[11px] font-semibold truncate max-w-[140px]"
                style={{
                  color: p.textColor || DEFAULT_POPUP_THEME.textColor,
                  background: p.highlightColor || "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.25)",
                }}
                title={p.text}
              >
                {p.text}
              </span>
            )}
          </div>

          {/* Position + visible-after row */}
          <div className="grid grid-cols-2 gap-2 ml-5">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Position
              </span>
              <select
                value={p.position ?? "random"}
                onChange={(e) =>
                  updateItem(i, {
                    position: e.target.value as PopupTextItem["position"],
                  })
                }
                className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Visible After (sec)
              </span>
              <input
                type="number"
                min={0}
                max={600}
                placeholder="default"
                value={p.delaySeconds ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  updateItem(i, {
                    delaySeconds:
                      v === "" ? undefined : Math.max(0, parseInt(v) || 0),
                  });
                }}
                className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500 tabular-nums placeholder-gray-600"
                title="Seconds before this popup shows. Falls back to the page's Popup Interval if blank."
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────── Step 2 — Popup Design ─────────────────────

function PopupStep({
  value,
  onChange,
  taskId,
  saving,
  onBack,
  onSaveAndContinue,
}: {
  value: ArticleConfig;
  onChange: (next: ArticleConfig) => void;
  taskId?: string;
  saving: boolean;
  onBack: () => void;
  onSaveAndContinue: () => void;
}) {
  const text = value.popupTextColor ?? DEFAULT_POPUP_THEME.textColor;
  const bg = value.popupBgColor ?? DEFAULT_POPUP_THEME.bgColor;
  const accent = value.popupAccentColor ?? DEFAULT_POPUP_THEME.accentColor;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Step 2 — Popup Design
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          What the popup looks like on every article page. Live preview on
          the right reflects every change.
        </p>
      </div>

      {/* Engagement mode toggle (v3 anti-bot suite) */}
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Engagement Mode
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              <strong>Natural</strong> = full anti-bot gating (dwell + scroll +
              visibility). <strong>Fast</strong> = skip gates, for testing only.
            </p>
          </div>
          <div className="inline-flex rounded-md overflow-hidden border border-emerald-500/30">
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, engagementMode: "natural" })
              }
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                (value.engagementMode ?? "natural") === "natural"
                  ? "bg-emerald-500 text-gray-950"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Natural
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, engagementMode: "fast" })}
              className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                value.engagementMode === "fast"
                  ? "bg-amber-500 text-gray-950"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Fast (test)
            </button>
          </div>
        </div>
      </div>

      <EngagementSanityWarning value={value} />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Form column */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Popup Title
            </label>
            <input
              value={value.popupTitle ?? ""}
              onChange={(e) =>
                onChange({ ...value, popupTitle: e.target.value })
              }
              placeholder="e.g. Continue reading"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Popup HTML Body
            </label>
            <textarea
              rows={6}
              value={value.popupHtml ?? ""}
              onChange={(e) =>
                onChange({ ...value, popupHtml: e.target.value })
              }
              placeholder="<p>Thanks for reading! …</p>"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              HTML allowed. <code>&lt;script&gt;</code>, <code>&lt;iframe&gt;</code>,{" "}
              and event handlers are stripped server-side.
            </p>
          </div>

          {/* Color pickers */}
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2">
            <p className="text-xs font-bold text-gray-300 inline-flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-pink-400" />
              Popup Colors
            </p>
            <div className="grid grid-cols-3 gap-2">
              <ColorPicker
                label="Text"
                icon={<Type className="w-3 h-3" />}
                value={text}
                fallback={DEFAULT_POPUP_THEME.textColor}
                onChange={(c) => onChange({ ...value, popupTextColor: c })}
              />
              <ColorPicker
                label="Background"
                value={bg}
                fallback={DEFAULT_POPUP_THEME.bgColor}
                onChange={(c) => onChange({ ...value, popupBgColor: c })}
              />
              <ColorPicker
                label="Accent / Button"
                value={accent}
                fallback={DEFAULT_POPUP_THEME.accentColor}
                onChange={(c) => onChange({ ...value, popupAccentColor: c })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5">
                <Clock className="w-3 h-3" />
                Wait Seconds
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={value.popupDelaySeconds ?? 5}
                onChange={(e) =>
                  onChange({
                    ...value,
                    popupDelaySeconds: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Final Button Label
              </label>
              <input
                value={value.generateKeyButtonLabel ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    generateKeyButtonLabel: e.target.value,
                  })
                }
                placeholder="e.g. Generate My Unique Key"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              After-click Toast Message
            </label>
            <input
              value={value.popupAfterClickMessage ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  popupAfterClickMessage: e.target.value,
                })
              }
              placeholder="Nice — keep reading, the next prompt will appear soon."
              maxLength={200}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Shown to the user as a small toast right after they click a popup, so they keep reading instead of dismissing the page.
            </p>
          </div>

        </div>

        {/* Preview column */}
        <div>
          <p className="text-xs font-medium text-gray-400 mb-1.5 inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Live Preview
          </p>
          <PopupPreview
            title={value.popupTitle ?? "Continue reading"}
            html={value.popupHtml ?? ""}
            buttonLabel={value.generateKeyButtonLabel ?? "Continue"}
            text={text}
            bg={bg}
            accent={accent}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onSaveAndContinue}
          disabled={saving || !taskId}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 rounded-lg text-sm font-bold disabled:opacity-50"
          title={!taskId ? "Save the task first" : ""}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Popup &amp; Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Inline warning shown in Step 2 when the admin picked "natural" engagement
 *  but at least one page has settings so loose that the anti-bot suite
 *  effectively becomes a no-op (low scroll requirement or short interval). */
function EngagementSanityWarning({ value }: { value: ArticleConfig }) {
  if ((value.engagementMode ?? "natural") !== "natural") return null;
  const pages = (value.pages ?? []).filter((p) => p.url.trim());
  const issues: string[] = [];
  pages.forEach((p, idx) => {
    const scroll = p.minScrollPercent ?? 60;
    const interval = p.popupIntervalSeconds ?? 15;
    const pageLabel = `Page ${idx + 1}${p.label ? ` (${p.label})` : ""}`;
    if (scroll < 30 || interval < 8) {
      issues.push(
        `${pageLabel}: scroll ${scroll}% / interval ${interval}s`
      );
    }
  });
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-xs font-bold text-amber-300 inline-flex items-center gap-1.5 mb-1">
        <AlertCircle className="w-3.5 h-3.5" />
        Natural mode looks weak
      </p>
      <p className="text-[11px] text-gray-300 mb-1">
        These pages have low scroll/interval values — bots will breeze through.
        Recommended: scroll ≥ 50%, interval ≥ 10s.
      </p>
      <ul className="text-[11px] text-amber-200/90 list-disc pl-5 space-y-0.5">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}

function ColorPicker({
  label,
  icon,
  value,
  fallback,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  fallback: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border border-gray-700 bg-gray-900 cursor-pointer shrink-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 bg-gray-900 border border-gray-700 rounded-md text-[11px] font-mono text-white focus:outline-none focus:border-pink-500"
        />
      </div>
      {value.toLowerCase() !== fallback.toLowerCase() && (
        <button
          type="button"
          onClick={() => onChange(fallback)}
          className="mt-1 text-[10px] text-gray-500 hover:text-gray-300 underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function PopupPreview({
  title,
  html,
  buttonLabel,
  text,
  bg,
  accent,
}: {
  title: string;
  html: string;
  buttonLabel: string;
  text: string;
  bg: string;
  accent: string;
}) {
  const safeHtml = useMemo(() => sanitizePopupHtml(html), [html]);
  return (
    <div
      className="rounded-xl border border-gray-800 overflow-hidden shadow-xl"
      style={{ background: bg, color: text }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${withAlpha(text, 0.12)}` }}
      >
        <span className="text-sm font-bold">{title}</span>
        <span
          className="text-[10px] uppercase tracking-wider opacity-70"
          style={{ color: text }}
        >
          1 / 3
        </span>
      </div>
      <div
        className="px-4 py-4 text-sm leading-relaxed"
        style={{ color: text }}
        dangerouslySetInnerHTML={{
          __html: safeHtml || "<p><em>Popup body preview…</em></p>",
        }}
      />
      <div
        className="px-4 py-3 flex justify-end"
        style={{ borderTop: `1px solid ${withAlpha(text, 0.08)}` }}
      >
        <button
          type="button"
          className="px-4 py-1.5 rounded-lg text-sm font-semibold cursor-default"
          style={{
            background: accent,
            color: contrastTextOn(accent),
          }}
        >
          {buttonLabel || "Continue"}
        </button>
      </div>
    </div>
  );
}

/** Simple hex → rgba helper for the preview's subtle dividers. */
function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Pick black or white for button text based on accent luminance. */
function contrastTextOn(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? "#0f172a" : "#ffffff";
}

// ───────────────────── Step 3 — Keys ─────────────────────

function KeysStep({
  taskId,
  unusedKeyCount,
  onStatsChange,
  onBack,
  onContinue,
}: {
  taskId?: string;
  unusedKeyCount: number;
  onStatsChange: (stats: { unused: number; total: number }) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const noKeys = unusedKeyCount === 0;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          Step 3 — Unique Key Pool
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Generate or paste keys. Each key is single-use; once a user claims
          one, it can never be re-issued or re-submitted.
        </p>
      </div>

      <KeyPoolManager taskId={taskId} onStatsChange={onStatsChange} />

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={noKeys}
          title={noKeys ? "Add at least one key to continue" : ""}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Embed
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ───────────────────── Step 4 — Embed snippets + Test ─────────────────────

function EmbedStep({
  taskId,
  pages,
  unusedKeyCount,
  totalKeyCount,
  onBack,
}: {
  taskId?: string;
  pages: ArticlePage[];
  unusedKeyCount: number;
  totalKeyCount: number;
  onBack: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const noKeys = unusedKeyCount === 0;

  const runTest = async () => {
    if (!taskId) return;
    if (noKeys) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/article-tasks/${taskId}/start`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const url = data.firstPageUrl as string | undefined;
      if (!url) throw new Error("Server did not return a first-page URL");
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Test started", {
        description:
          "Page-1 article opened in a new tab with a fresh session token.",
      });
    } catch (err) {
      toast.error("Test failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          Step 4 — Embed Snippets &amp; Test
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Copy each snippet onto its corresponding article page. Use{" "}
          <strong>Test the Embed</strong> below to walk the full flow as a
          user.
        </p>
      </div>

      <EmbedSnippets taskId={taskId} pageCount={pages.length} />

      {taskId && pages.length > 0 && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-2">
          <p className="text-sm font-bold text-purple-300 inline-flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Test the Embed
          </p>
          <p className="text-xs text-gray-400">
            Opens page 1 in a new tab with a real session token attached.
            Walk through every popup → final page → key generation. <strong>One
            key from your pool will be consumed</strong> by this test (you can
            clear unused keys + regenerate any time).
          </p>
          {noKeys ? (
            <p className="text-[11px] font-semibold text-amber-300 inline-flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Pool empty — generate keys in Step 3 before testing.
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">
              Pool: <strong className="text-gray-300">{unusedKeyCount}</strong> unused • <strong className="text-gray-300">{totalKeyCount}</strong> total
            </p>
          )}
          <button
            type="button"
            onClick={runTest}
            disabled={testing || noKeys}
            title={noKeys ? "Add at least one key in Step 3" : ""}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            Open Test Run
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-xs text-gray-500">
          All set — admin task setup is complete.
        </span>
      </div>
    </div>
  );
}

// ───────────────────── Key Pool Manager ─────────────────────

interface KeyRow {
  id: string;
  keyValue: string;
  claimedByUserId: string | null;
  claimedAt: string | null;
  submissionId: string | null;
  createdAt: string;
  claimer: { id: string; name: string | null; email: string | null } | null;
}

interface KeyPoolStats {
  total: number;
  unused: number;
  claimed: number;
  submitted: number;
  keys: KeyRow[];
}

function KeyPoolManager({
  taskId,
  onStatsChange,
}: {
  taskId?: string;
  onStatsChange?: (stats: { unused: number; total: number }) => void;
}) {
  const [data, setData] = useState<KeyPoolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [genCount, setGenCount] = useState(50);
  const [pasteText, setPasteText] = useState("");
  const [pasteMode, setPasteMode] = useState<"append" | "replace">("append");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/article-keys`);
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as KeyPoolStats;
      setData(d);
    } catch (err) {
      toast.error("Couldn't load keys", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  // Lift stats up so Step 3's Continue button and Step 4's Test button
  // can gate on `unused > 0` without owning the fetch.
  useEffect(() => {
    if (data && onStatsChange) {
      onStatsChange({ unused: data.unused, total: data.total });
    }
  }, [data, onStatsChange]);

  const generate = async () => {
    if (!taskId) {
      toast.info("Save the task first, then generate keys here.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/article-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", count: genCount }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(`Generated ${d.created} new keys`);
      await load();
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const submitPasted = async () => {
    if (!taskId) {
      toast.info("Save the task first, then add keys here.");
      return;
    }
    const lines = pasteText
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste at least one key (one per line).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/article-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pasteMode, keys: lines }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(
        `${pasteMode === "replace" ? "Replaced" : "Added"} keys: ${d.created} new${
          d.skipped ? `, ${d.skipped} duplicates skipped` : ""
        }`
      );
      setPasteText("");
      await load();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const previewKeys = () => {
    const set = new Set<string>();
    while (set.size < Math.min(genCount, 5)) set.add(generateRandomArticleKey());
    return Array.from(set);
  };

  const clearUnused = async () => {
    if (!taskId) return;
    if (!(await confirmDialog({ title: "Delete all UNUSED keys for this task?", description: "Claimed keys are kept.", tone: "danger", confirmLabel: "Delete" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/article-keys`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(`Deleted ${d.deleted} unused keys`);
      await load();
    } catch (err) {
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!taskId) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          Unique Key Pool
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Save the task first. After saving, this section will let you
          generate or paste keys.
        </p>
      </div>
    );
  }

  const visibleKeys = data?.keys ?? [];
  const shown = showAll ? visibleKeys : visibleKeys.slice(0, 20);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          Unique Key Pool
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total" value={data.total} tone="bg-gray-800" />
          <Stat label="Unused" value={data.unused} tone="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" />
          <Stat label="Claimed" value={data.claimed} tone="bg-amber-500/10 text-amber-300 border border-amber-500/30" />
        </div>
      )}

      {/* Generator */}
      <div className="rounded-md bg-gray-900 border border-gray-800 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300">Auto-generate</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={10000}
            value={genCount}
            onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
            className="w-24 px-2 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 tabular-nums"
          />
          <span className="text-xs text-gray-500">random keys</span>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-gray-950 font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate &amp; Save
          </button>
        </div>
        <p className="text-[10px] text-gray-500 font-mono">
          Preview: {previewKeys().join(" · ")}
        </p>
      </div>

      {/* Manual paste */}
      <div className="rounded-md bg-gray-900 border border-gray-800 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-300">Manual entry</p>
        <textarea
          rows={4}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste one key per line, or comma-separated…"
          className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
            <input
              type="radio"
              name="paste-mode"
              checked={pasteMode === "append"}
              onChange={() => setPasteMode("append")}
            />
            Append
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
            <input
              type="radio"
              name="paste-mode"
              checked={pasteMode === "replace"}
              onChange={() => setPasteMode("replace")}
            />
            Replace unused
          </label>
          <button
            type="button"
            onClick={submitPasted}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Save Pasted Keys
          </button>
        </div>
      </div>

      {/* Key list */}
      {data && data.keys.length > 0 && (
        <div className="rounded-md bg-gray-900 border border-gray-800 overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-300">
              {data.keys.length} keys
            </p>
            <button
              type="button"
              onClick={clearUnused}
              disabled={busy || data.unused === 0}
              className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 className="w-3 h-3" />
              Clear unused
            </button>
          </div>
          <div className="divide-y divide-gray-800 max-h-72 overflow-y-auto">
            {shown.map((k) => (
              <div
                key={k.id}
                className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs"
              >
                <code className="font-mono text-gray-300">{k.keyValue}</code>
                {k.claimer ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    {k.submissionId ? "Submitted" : "Claimed"} ·{" "}
                    {k.claimer.name ?? k.claimer.email}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Unused
                  </span>
                )}
              </div>
            ))}
          </div>
          {data.keys.length > 20 && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="w-full px-3 py-2 text-[11px] text-indigo-400 hover:text-indigo-300 border-t border-gray-800"
            >
              {showAll ? "Show fewer" : `Show all ${data.keys.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`rounded-lg p-2 ${tone}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

// ───────────────────── Embed snippets ─────────────────────

function EmbedSnippets({
  taskId,
  pageCount,
}: {
  taskId?: string;
  pageCount: number;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");

  // Reading `window` after mount is the SSR-safe way to get the origin: a lazy
  // `useState` initialiser would produce "" on the server and the real origin on
  // the client, which is a hydration mismatch. The rule cannot express "this is
  // the accepted pattern for a browser-only value", so it is silenced here
  // rather than the code being made wrong to satisfy it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  if (!taskId || pageCount === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
        <p className="text-sm font-bold text-white inline-flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          HTML Embed Snippets
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {!taskId
            ? "Save the task first. Snippets will appear here."
            : "Add at least one page above to generate embed snippets."}
        </p>
      </div>
    );
  }

  const copy = async (snippet: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedIdx(idx);
      toast.success("Embed snippet copied");
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-cyan-300 inline-flex items-center gap-2">
          <FileCode className="w-4 h-4" />
          HTML Embed Snippets
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Paste each snippet inside the corresponding article page&apos;s
          HTML (just before <code className="text-cyan-300">&lt;/body&gt;</code>{" "}
          works fine). The script is async, ~3 KB, and safe on third-party
          domains.
        </p>
      </div>
      <div className="space-y-2">
        {Array.from({ length: pageCount }, (_, i) => {
          const snippet = `<script src="${origin}/embed/article.js" data-task="${taskId}" data-page="${i + 1}" async></script>`;
          return (
            <div
              key={i}
              className="rounded-md bg-gray-950 border border-gray-800 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-300">
                  Page {i + 1}
                  {i === pageCount - 1 && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                      Final · Generates Key
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => copy(snippet, i)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md"
                >
                  {copiedIdx === i ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copiedIdx === i ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="text-[11px] font-mono text-cyan-200 bg-black/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                {snippet}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────── Legacy (v1) mode ─────────────────────

function LegacyMode({ value, onChange }: Props) {
  const [keywordInput, setKeywordInput] = useState("");

  const updateLink = (idx: number, patch: Partial<ArticleLink>) => {
    const next = [...value.links];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...value, links: next });
  };
  const addLink = () => {
    onChange({ ...value, links: [...value.links, { url: "", label: "" }] });
  };
  const removeLink = (idx: number) => {
    if (value.links.length <= 1) return;
    onChange({ ...value, links: value.links.filter((_, i) => i !== idx) });
  };

  const addKeyword = (raw: string) => {
    const k = raw.trim();
    if (!k) return;
    if (value.keywords.includes(k)) return;
    onChange({ ...value, keywords: [...value.keywords, k] });
    setKeywordInput("");
  };
  const removeKeyword = (k: string) => {
    onChange({ ...value, keywords: value.keywords.filter((x) => x !== k) });
  };

  const setProof = (
    key: keyof ArticleConfig["proofRequirements"],
    v: boolean
  ) => {
    onChange({
      ...value,
      proofRequirements: { ...value.proofRequirements, [key]: v },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-white inline-flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-indigo-400" />
              Article Links
              <span className="text-red-400">*</span>
            </p>
          </div>
          <button
            type="button"
            onClick={addLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Link
          </button>
        </div>
        <div className="space-y-2">
          {value.links.map((link, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono shrink-0">
                  #{idx + 1}
                </span>
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => updateLink(idx, { url: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
                {value.links.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLink(idx)}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={link.label ?? ""}
                onChange={(e) => updateLink(idx, { label: e.target.value })}
                placeholder="Label (optional)"
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Hash className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-white">
            Keywords{" "}
            <span className="text-gray-500 font-normal text-xs">(optional)</span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {value.keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/30"
              >
                {k}
                <button
                  type="button"
                  onClick={() => removeKeyword(k)}
                  className="hover:text-amber-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {value.keywords.length === 0 && (
              <span className="text-xs text-gray-600">No keywords yet.</span>
            )}
          </div>
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addKeyword(keywordInput);
              }
              if (
                e.key === "Backspace" &&
                keywordInput === "" &&
                value.keywords.length > 0
              ) {
                removeKeyword(value.keywords[value.keywords.length - 1]);
              }
            }}
            onBlur={() => addKeyword(keywordInput)}
            placeholder="Type a keyword and press Enter…"
            className="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-white">Proof Required</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ProofToggle
            label="Proof URL"
            help="User submits a link as proof"
            checked={value.proofRequirements.url}
            onChange={(v) => setProof("url", v)}
          />
          <ProofToggle
            label="Screenshot"
            help="User uploads a screenshot URL"
            checked={value.proofRequirements.screenshot}
            onChange={(v) => setProof("screenshot", v)}
          />
          <ProofToggle
            label="Unique Key"
            help="User finds + types a key from article"
            checked={value.proofRequirements.uniqueKey}
            onChange={(v) => setProof("uniqueKey", v)}
            icon={<KeyRound className="w-3 h-3" />}
          />
        </div>
      </div>

      {value.proofRequirements.uniqueKey && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <p className="text-sm font-bold text-amber-300 inline-flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Unique Key Verification
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Expected Key Value <span className="text-red-400">*</span>
            </label>
            <input
              value={value.uniqueKey ?? ""}
              onChange={(e) => onChange({ ...value, uniqueKey: e.target.value })}
              placeholder="e.g. sunshine-2026"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Hint shown to user
            </label>
            <textarea
              rows={2}
              value={value.uniqueKeyHint ?? ""}
              onChange={(e) =>
                onChange({ ...value, uniqueKeyHint: e.target.value })
              }
              placeholder="e.g. 'Find the secret word at the end of the article'"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ProofToggle({
  label,
  help,
  checked,
  onChange,
  icon,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-500/10"
          : "border-gray-800 bg-gray-950 hover:border-gray-700"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded bg-gray-800 border-gray-600 text-indigo-500"
        />
        {icon}
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <span className="text-[11px] text-gray-500">{help}</span>
    </label>
  );
}
