"use client";

import { useEffect, useMemo } from "react";
import { Reorder, useDragControls } from "framer-motion";
import {
  getPlatform,
  getAction,
  getPlatformGroups,
  emptyBundleConfig,
  bundleTotalPoints,
  actionPriority,
  isWatchAction,
  type AiMode,
  type SocialBundleConfig,
  type BundleItem,
  type ProofRequirements as ProofReqs,
  type SocialField,
  type SocialAction,
} from "@/lib/social-tasks";
import { diyPromptFor } from "@/lib/social-ai-recipe";
import {
  Sparkles,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  GripVertical,
  ShieldCheck,
} from "lucide-react";
import { BrandIcon } from "@/components/ui/brand-icon";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";

/**
 * How the user gets their post content.
 *
 * "Users prompt ChatGPT themselves" costs nothing and works even without a
 * Gemini key — worth choosing when a task will go out to a lot of people.
 */
const AI_MODE_OPTIONS: Array<{ value: AiMode; label: string }> = [
  { value: "off", label: "Fixed content" },
  { value: "generate", label: "AI generates in-app" },
  { value: "diy", label: "Users prompt ChatGPT" },
  { value: "both", label: "Both" },
];

interface Props {
  value: SocialBundleConfig;
  onChange: (next: SocialBundleConfig) => void;
  /** The task being edited — used to preview the exact prompt users will see. */
  taskTitle?: string;
  taskDescription?: string;
}

/**
 * Admin-side builder for a SOCIAL task BUNDLE.
 * Step 1: pick a platform.
 * Step 2: check one or more actions (shown in natural-flow order).
 * Step 3: each selected action gets its own card — points, dynamic admin
 *          fields, optional AI prompt, and proof requirements.
 * The task's total points = Σ of each item's points (recomputed server-side).
 */
export function SocialTaskBuilder({
  value,
  onChange,
  taskTitle = "",
  taskDescription = "",
}: Props) {
  const platform = useMemo(() => getPlatform(value.platform), [value.platform]);

  // Selected items in the admin's chosen order — the exact order users will
  // complete them in. Reorderable by drag (see the Reorder.Group below).
  const items = value.items;
  const total = useMemo(() => bundleTotalPoints(items), [items]);

  const commit = (nextItems: BundleItem[]) => {
    onChange({ ...value, items: nextItems, version: 2 });
  };

  const setPlatform = (key: string) => {
    // Switching platform clears the bundle (actions are platform-specific).
    onChange({ ...emptyBundleConfig(), platform: key });
  };

  const isSelected = (actionKey: string) =>
    value.items.some((i) => i.action === actionKey);

  const toggleAction = (actionKey: string) => {
    if (isSelected(actionKey)) {
      commit(value.items.filter((i) => i.action !== actionKey));
      return;
    }
    const def = getAction(value.platform, actionKey);
    if (!def) return;
    const fresh: BundleItem = {
      action: actionKey,
      fields: {},
      points: def.suggestedReward?.min ?? 0,
      proofRequirements: deriveDefaultProofRequirements(value.platform, actionKey),
      aiPromptEnabled: false,
      aiPrompt: null,
    };
    // Append to the end; the admin drags to set the final order.
    commit([...value.items, fresh]);
  };

  const updateItem = (actionKey: string, patch: Partial<BundleItem>) => {
    commit(
      value.items.map((i) =>
        i.action === actionKey ? { ...i, ...patch } : i
      )
    );
  };

  // Reset config if platform is set but invalid
  useEffect(() => {
    if (value.platform && !platform) {
      onChange(emptyBundleConfig());
    }
  }, [value.platform, platform, onChange]);

  const sortedActions = useMemo(
    () =>
      platform
        ? [...platform.actions].sort(
            (a, b) => actionPriority(a.key) - actionPriority(b.key)
          )
        : [],
    [platform]
  );

  return (
    <div className="space-y-6">
      {/* Platform picker */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Platform <span className="text-red-400">*</span>
        </label>
        <div className="space-y-4">
          {getPlatformGroups().map((group) => (
            <div key={group.key}>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                {group.label}
                <span className="ml-1.5 text-gray-600 font-semibold">
                  ({group.platforms.length})
                </span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {group.platforms.map((p) => {
                  const selected = value.platform === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPlatform(p.key)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                        selected
                          ? `${p.brandColor} border-transparent shadow-lg`
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      <BrandIcon
                        brand={p.key}
                        fallback={p.emoji}
                        colored={!selected}
                        className={selected ? "w-6 h-6 text-white" : "w-6 h-6"}
                      />
                      <span className="text-[11px] font-semibold">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action checklist (only after platform selected) */}
      {platform && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Actions <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Check every {platform.label} action this task bundles. Users complete
            them in order — drag the cards below by the ⠿ handle to set the order.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {sortedActions.map((a) => {
              const selected = isSelected(a.key);
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggleAction(a.key)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selected
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "bg-gray-800 border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="checkbox"
                      readOnly
                      checked={selected}
                      className="rounded bg-gray-800 border-gray-600 text-indigo-500 pointer-events-none"
                    />
                    <span className="text-lg">{a.emoji}</span>
                    <span className="text-sm font-semibold text-white">
                      {a.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {a.description}
                  </p>
                  {a.suggestedReward && (
                    <p className="text-[10px] text-amber-400 mt-1">
                      ~{a.suggestedReward.min}-{a.suggestedReward.max} pts
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-item configuration cards — drag by the ⠿ handle to reorder */}
      {items.length > 0 && (
        <Reorder.Group
          as="div"
          axis="y"
          values={items}
          onReorder={commit}
          className="space-y-5"
        >
          {items.map((item, idx) => (
            <SocialActionCard
              key={item.action}
              item={item}
              idx={idx}
              platformKey={value.platform}
              platformLabel={platform?.label}
              taskTitle={taskTitle}
              taskDescription={taskDescription}
              onUpdate={(patch) => updateItem(item.action, patch)}
              onRemove={() => toggleAction(item.action)}
            />
          ))}
        </Reorder.Group>
      )}

      {/* Sequential-unlock toggle — only meaningful with 2+ actions */}
      {items.length > 1 && (
        <label className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.sequential ?? false}
            onChange={(e) =>
              onChange({ ...value, sequential: e.target.checked, version: 2 })
            }
            className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
          />
          <span>
            <span className="block text-sm font-semibold text-white">
              Complete actions in order
            </span>
            <span className="block text-xs text-gray-500">
              Each action stays locked until the previous one is done — drag the
              handles above to set the order.
            </span>
          </span>
        </label>
      )}

      {/* Live bundle summary */}
      {platform && items.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <span className="text-sm text-gray-300">
            {items.length} action{items.length > 1 ? "s" : ""} in this bundle
          </span>
          <span className="text-sm font-bold text-white">
            Total reward: {total} pts
          </span>
        </div>
      )}

      {platform && items.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-500">
          Check at least one action above to build the bundle.
        </div>
      )}

      {!platform && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-500">
          Select a platform above to configure the bundle.
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Draggable per-action config card (order = the order users complete them in)
// -----------------------------------------------------------------------------

function SocialActionCard({
  item,
  idx,
  platformKey,
  platformLabel,
  taskTitle = "",
  taskDescription = "",
  onUpdate,
  onRemove,
}: {
  item: BundleItem;
  idx: number;
  platformKey: string | null;
  platformLabel?: string;
  taskTitle?: string;
  taskDescription?: string;
  onUpdate: (patch: Partial<BundleItem>) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const def = getAction(platformKey, item.action);
  // Which bot membership check (if any) fits this platform+action.
  const memberVerify: "TELEGRAM_MEMBER" | "DISCORD_MEMBER" | null =
    platformKey === "TELEGRAM" &&
    (item.action === "JOIN_CHANNEL" || item.action === "JOIN_GROUP")
      ? "TELEGRAM_MEMBER"
      : platformKey === "DISCORD" && item.action === "JOIN_SERVER"
        ? "DISCORD_MEMBER"
        : null;
  if (!def) return null;

  return (
    <Reorder.Item
      as="div"
      value={item}
      dragListener={false}
      dragControls={controls}
      className="space-y-5 p-4 rounded-xl bg-gray-950 border border-gray-800"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-2">
          {/* Drag handle — only this starts a drag, so the inputs stay usable */}
          <button
            type="button"
            aria-label="Drag to reorder"
            onPointerDown={(e) => controls.start(e)}
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded-lg p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div>
            <p className="text-sm font-bold text-white">
              <span className="text-gray-500">{idx + 1}.</span> {def.emoji}{" "}
              {def.label}{" "}
              <span className="text-gray-400 font-normal">on {platformLabel}</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{def.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {def.supportsAiPrompt && (
            <label
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30"
              title="How each user gets their content."
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <select
                value={item.aiMode ?? (item.aiPromptEnabled ? "generate" : "off")}
                onChange={(e) => {
                  const mode = e.target.value as AiMode;
                  onUpdate({
                    aiMode: mode,
                    // Keep the legacy flag in sync — older readers still use it.
                    aiPromptEnabled: mode !== "off",
                    aiPrompt: mode === "off" ? null : (item.aiPrompt ?? ""),
                  });
                }}
                className="bg-transparent text-xs font-semibold text-purple-300 focus:outline-none cursor-pointer"
              >
                {AI_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-gray-900">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
            title="Remove action"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Per-item points */}
      <PointsStepper
        value={item.points}
        onChange={(n) => onUpdate({ points: n })}
      />

      {/* Watch/listen duration — for watch-type actions (feeds the timed lock) */}
      {isWatchAction(item.action) && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Watch / Listen duration (seconds)
          </label>
          <input
            type="number"
            min={0}
            value={item.watchSeconds ?? 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              onUpdate({
                watchSeconds: Number.isFinite(n) && n > 0 ? n : undefined,
              });
            }}
            placeholder="30"
            className="w-32 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            If set, users must watch this long in a locked player before it counts.
          </p>
        </div>
      )}

      {item.aiPromptEnabled && def.aiGeneratableFields ? (
        <AiPromptSection
          prompt={item.aiPrompt ?? ""}
          onChange={(p) => onUpdate({ aiPrompt: p })}
          def={def}
          platformLabel={platformLabel}
          fields={item.fields}
          taskTitle={taskTitle}
          taskDescription={taskDescription}
        />
      ) : null}

      {/* Admin fields. When AI-generate is on, the content field stays visible
          as the "reference/example" the AI bases each user's variant on (and it
          becomes optional — users may generate purely from the task). */}
      <div className="space-y-3">
        {def.adminFields.map((field) => {
          const isAiGen = def.aiGeneratableFields?.includes(field.key);
          const aiRef = item.aiPromptEnabled && isAiGen;
          return (
            <FieldEditor
              key={field.key}
              field={
                aiRef
                  ? {
                      ...field,
                      label: `${field.label} — reference/example (optional)`,
                      required: false,
                      helperText:
                        "Users click AI to generate a unique variant based on this. Leave blank to generate purely from the task title/description.",
                    }
                  : field
              }
              value={item.fields[field.key] ?? ""}
              onChange={(v) =>
                onUpdate({ fields: { ...item.fields, [field.key]: v } })
              }
            />
          );
        })}
      </div>

      {/* Auto-verify by code — content actions only. The server fetches the
          user's proof URL and confirms their unique code is present, so it
          auto-approves without a fakeable screenshot. */}
      {def.supportsAiPrompt && (
        <label
          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 cursor-pointer"
          title="Each user gets a unique code they must include in their post/comment. On submit the server fetches the public URL and verifies the code — screenshots can't fake it. Works on publicly fetchable pages; private walls fall back to manual review."
        >
          <input
            type="checkbox"
            checked={item.verify === "CODE"}
            onChange={() =>
              onUpdate(
                item.verify === "CODE"
                  ? { verify: undefined }
                  : {
                      verify: "CODE",
                      // A proof URL is required to fetch + verify.
                      proofRequirements: {
                        ...item.proofRequirements,
                        url: true,
                      },
                    }
              )
            }
            className="mt-0.5 rounded bg-gray-800 border-gray-600 text-emerald-500"
          />
          <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <span className="text-xs">
            <span className="font-semibold text-emerald-300">
              Auto-verify by code in content
            </span>
            <span className="block text-emerald-400/70">
              User must embed a unique code; server fetches the URL to confirm.
              Auto-approves on match.
            </span>
          </span>
        </label>
      )}

      {/* Auto-verify membership by bot — Telegram/Discord join actions. */}
      {memberVerify && (
        <div className="space-y-2">
          <label
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 cursor-pointer"
            title="A bot you control confirms the user actually joined — impossible to fake. Requires the bot token in Settings → Integrations and the bot added to the target as admin, plus the user linking their account."
          >
            <input
              type="checkbox"
              checked={item.verify === memberVerify}
              onChange={() =>
                onUpdate(
                  item.verify === memberVerify
                    ? { verify: undefined }
                    : { verify: memberVerify }
                )
              }
              className="mt-0.5 rounded bg-gray-800 border-gray-600 text-emerald-500"
            />
            <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-xs">
              <span className="font-semibold text-emerald-300">
                Auto-verify membership (bot)
              </span>
              <span className="block text-emerald-400/70">
                Bot confirms the user joined. Auto-approves on match.
              </span>
            </span>
          </label>
          {item.verify === memberVerify && (
            <input
              value={item.fields.verifyTarget ?? ""}
              onChange={(e) =>
                onUpdate({
                  fields: { ...item.fields, verifyTarget: e.target.value },
                })
              }
              placeholder={
                memberVerify === "TELEGRAM_MEMBER"
                  ? "Verify target — @channelusername or chat id (e.g. -1001234567890)"
                  : "Verify target — Discord guild (server) id"
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
          )}
        </div>
      )}

      {/* Proof requirements */}
      <ProofRequirements
        value={item.proofRequirements}
        defaultProofFields={def.proofFields}
        onChange={(pr) => onUpdate({ proofRequirements: pr })}
      />
    </Reorder.Item>
  );
}

// -----------------------------------------------------------------------------
// Points stepper (per bundle item)
// -----------------------------------------------------------------------------

function PointsStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1.5">
        Points for this action
      </label>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-24 text-center px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// AI Prompt Section
// -----------------------------------------------------------------------------

function AiPromptSection({
  prompt,
  onChange,
  def,
  platformLabel,
  fields,
  taskTitle,
  taskDescription,
}: {
  prompt: string;
  onChange: (next: string) => void;
  def: SocialAction;
  platformLabel?: string;
  fields: Record<string, string>;
  taskTitle: string;
  taskDescription: string;
}) {
  const label = platformLabel ?? "social media";
  // Names, not raw field keys — `pinDescription, imagePrompt` reads as noise.
  const generatableLabels = (def.recipe ?? [])
    .filter((s) => s.aiGeneratable)
    .map((s) => s.label);
  // The exact text a user in copy-prompt mode will be handed. Showing it here is
  // the admin's only way to check the recipe is actually complete before saving.
  const preview = diyPromptFor(
    def,
    label,
    fields,
    { title: taskTitle, description: taskDescription },
    prompt
  );

  return (
    <div className="rounded-lg bg-purple-500/5 border border-purple-500/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <p className="text-sm font-bold text-purple-300">
          Extra AI instructions (optional)
        </p>
      </div>
      <p className="text-xs text-gray-400">
        Users get a unique {def.label.toLowerCase()} built from this task&apos;s
        title/description and your reference content above. Add any extra
        guidance (tone, length, hashtags) here — leave blank for sensible
        defaults.
      </p>
      <textarea
        rows={3}
        value={prompt}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 'Friendly tone, under 200 characters, add 1-2 relevant hashtags.'"
        className="w-full px-3 py-2 bg-gray-950 border border-purple-500/30 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />
      <p className="text-[11px] text-gray-500">
        AI writes:{" "}
        <span className="text-purple-300">{generatableLabels.join(", ")}</span>.
        Everything else you filled in above is passed through unchanged. Each
        user gets a different result.
      </p>
      <details className="group">
        <summary className="text-[11px] text-purple-300 cursor-pointer select-none hover:text-purple-200">
          Preview the prompt users will copy
        </summary>
        <pre className="mt-2 p-2 rounded bg-gray-950 border border-gray-800 text-[10px] text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {preview}
        </pre>
      </details>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Field editor — renders the right input type for each FieldType
// -----------------------------------------------------------------------------

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: SocialField;
  value: string;
  onChange: (v: string) => void;
}) {
  const labelEl = (
    <label className="block text-sm font-medium text-gray-400 mb-1.5">
      {field.label}
      {field.required && <span className="text-red-400 ml-1">*</span>}
    </label>
  );
  const helperEl = field.helperText ? (
    <p className="text-[11px] text-gray-500 mt-1">{field.helperText}</p>
  ) : null;

  const baseClass =
    "w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500";

  if (field.type === "textarea") {
    return (
      <div>
        {labelEl}
        <textarea
          rows={3}
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseClass + " resize-none"}
        />
        {helperEl}
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div>
        {labelEl}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={baseClass}
        >
          <option value="">Select…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {helperEl}
      </div>
    );
  }

  if (field.type === "image-url") {
    // Uploading (rather than pasting an external URL) matters here: an image in
    // our own bucket is served same-origin through /api/media, which is what
    // makes the user's Download button actually download instead of just
    // opening a tab. A pasted third-party URL can't be forced to download.
    return (
      <div>
        {labelEl}
        <ImageUploadField
          value={value}
          onChange={onChange}
          previewSize="md"
          urlPlaceholder={field.placeholder ?? "…or paste a URL"}
        />
        {helperEl}
      </div>
    );
  }

  if (field.type === "image-prompt") {
    return (
      <div>
        {labelEl}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={baseClass + " resize-y"}
        />
        <p className="text-[10px] text-purple-300/80 mt-1 flex items-start gap-1">
          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
          Fill either the image above OR this prompt. Users paste the prompt into
          ChatGPT/Gemini, generate the image themselves, and upload it.
        </p>
        {helperEl}
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseClass}
        />
        {helperEl}
      </div>
    );
  }

  // text, url, screenshot all use plain input
  return (
    <div>
      {labelEl}
      <input
        type={field.type === "url" ? "url" : "text"}
        required={field.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={baseClass}
      />
      {helperEl}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Proof requirements — admin can override what user must submit
// -----------------------------------------------------------------------------

function ProofRequirements({
  value,
  defaultProofFields,
  onChange,
}: {
  value: ProofReqs;
  defaultProofFields: SocialField[];
  onChange: (next: ProofReqs) => void;
}) {
  const set = (key: keyof ProofReqs, v: boolean) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <p className="text-sm font-bold text-white">Proof Required</p>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Optional — what users must submit to complete this task. Leave all off to
        require no proof (e.g. watch actions verify automatically).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Toggle
          label="Proof URL"
          help="User submits a link (e.g. their post, comment, or profile)"
          checked={value.url}
          onChange={(v) => set("url", v)}
        />
        <Toggle
          label="Screenshot"
          help="User uploads a screenshot of the action"
          checked={value.screenshot}
          onChange={(v) => set("screenshot", v)}
        />
        <Toggle
          label="Username"
          help="User submits their handle on the platform"
          checked={value.username}
          onChange={(v) => set("username", v)}
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-3">
        Default proof fields for this action:{" "}
        <span className="text-gray-300">
          {defaultProofFields.map((f) => f.label).join(", ") || "none"}
        </span>
      </p>
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
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
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <span className="text-[11px] text-gray-500">{help}</span>
    </label>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function deriveDefaultProofRequirements(
  platformKey: string | null | undefined,
  actionKey: string
): ProofReqs {
  // Watch actions verify via the locked player — default to no manual proof.
  if (isWatchAction(actionKey)) {
    return { url: false, screenshot: false, username: false };
  }
  const action = getAction(platformKey, actionKey);
  if (!action) return { url: true, screenshot: true, username: false };
  const keys = action.proofFields.map((f) => f.key);
  return {
    url: keys.includes("proofUrl"),
    screenshot: keys.includes("screenshotUrl"),
    username: keys.includes("proofUsername"),
  };
}
