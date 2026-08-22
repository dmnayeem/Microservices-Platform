"use client";

import { useEffect, useState } from "react";
import {
  PlayCircle,
  Clock,
  Hourglass,
  Send,
  KeyRound,
  AlertCircle,
  ListChecks,
  Camera,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Link2,
} from "lucide-react";
import {
  type VideoConfig,
  type VideoStep,
  type VideoStepType,
  STEP_TYPE_META,
  defaultStepLabel,
  synthesizeStepsFromEngagement,
  detectProvider,
  getProviderMeta,
  formatDuration,
} from "@/lib/video-tasks";
import { BrandIcon } from "@/components/ui/brand-icon";

interface Props {
  value: VideoConfig;
  onChange: (next: VideoConfig) => void;
}

export function VideoTaskBuilder({ value, onChange }: Props) {
  const [urlDraft, setUrlDraft] = useState(value.videoUrl);

  // Auto-detect provider whenever videoUrl changes
  useEffect(() => {
    const provider = detectProvider(value.videoUrl);
    if (provider !== value.provider) {
      onChange({ ...value, provider });
    }
  }, [value.videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Migrate a legacy engagement checklist into editable typed steps once, so the
  // old like/comment/subscribe config shows in the Proof steps editor (with real
  // screenshot/link proof) instead of the removed honor-checkbox UI.
  useEffect(() => {
    if (value.engagement && !value.steps?.length) {
      const synthesized = synthesizeStepsFromEngagement(value);
      if (synthesized.length) {
        onChange({ ...value, steps: synthesized, engagement: undefined });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setProof = (
    key: keyof VideoConfig["proofRequirements"],
    v: boolean
  ) => {
    onChange({
      ...value,
      proofRequirements: { ...value.proofRequirements, [key]: v },
    });
  };

  const meta = getProviderMeta(value.provider);

  return (
    <div className="space-y-6">
      {/* Video URL */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PlayCircle className="w-4 h-4 text-red-400" />
          <p className="text-sm font-bold text-white">
            Video URL <span className="text-red-400">*</span>
          </p>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Supports YouTube, Facebook, Vimeo, and direct video files. Provider
          is detected automatically.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => onChange({ ...value, videoUrl: urlDraft })}
            placeholder="https://www.youtube.com/watch?v=…  or  https://fb.watch/…"
            className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <span
            className={`inline-flex items-center gap-1 px-3 rounded-lg text-xs font-bold border ${meta.tone}`}
          >
            <BrandIcon brand={value.provider} fallback={meta.emoji} colored className="w-3.5 h-3.5" />
            {meta.label}
          </span>
        </div>
        {(value.provider === "YOUTUBE" || value.provider === "FACEBOOK") && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              Watch time is tracked from real playback and verified on the
              server, so in-app rewards are accurate and won&apos;t be clawed
              back. Note: whether the view also counts on{" "}
              {value.provider === "YOUTUBE" ? "YouTube" : "Facebook"} is decided
              by their own systems — incentivized views may be filtered out by
              their fraud audits. That part is outside our control.
              {value.provider === "YOUTUBE" && (
                <>
                  {" "}
                  YouTube&apos;s own in-video ads also can&apos;t be
                  auto-skipped (browser cross-origin limit) — your own
                  skippable ad shows instead.
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Watch time + warmup */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Clock className="w-4 h-4 text-blue-400" />
            <label className="text-sm font-bold text-white">
              Watch Time <span className="text-red-400">*</span>
            </label>
          </div>
          <input
            type="number"
            min={1}
            value={value.watchSeconds}
            onChange={(e) =>
              onChange({
                ...value,
                watchSeconds: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            ≈ {formatDuration(value.watchSeconds)} — real playback time the user
            must watch. Tip: keep ≥30s so it&apos;s more likely to register as a
            view on YouTube/Facebook.
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Hourglass className="w-4 h-4 text-amber-400" />
            <label className="text-sm font-bold text-white">Warmup Time</label>
          </div>
          <input
            type="number"
            min={0}
            max={30}
            value={value.warmupSeconds}
            onChange={(e) =>
              onChange({
                ...value,
                warmupSeconds: Math.max(0, parseInt(e.target.value) || 0),
              })
            }
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Delay before timer starts (anti-bot, default 3).
          </p>
        </div>
      </div>

      {/* One-tap finish */}
      <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-950 cursor-pointer hover:border-gray-700">
        <input
          type="checkbox"
          checked={value.autoSubmit}
          onChange={(e) => onChange({ ...value, autoSubmit: e.target.checked })}
          className="mt-0.5 rounded bg-gray-800 border-gray-600 text-indigo-500"
        />
        <div className="flex-1">
          <p className="text-sm font-bold text-white inline-flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            One-tap finish
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Skip the extra proof form after the video — the user just presses
            Submit. They always press it themselves; nothing is ever submitted
            for them.
          </p>
        </div>
      </label>

      {/* Proof requirements */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-white">Proof Required</p>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Most video tasks just need watch time, but you can require extra
          proof (e.g. unique key shown in video).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ProofToggle
            label="Screenshot"
            help="User uploads a screenshot URL after watching"
            checked={value.proofRequirements.screenshot}
            onChange={(v) => setProof("screenshot", v)}
          />
          <ProofToggle
            label="Unique Key"
            help="User types a code/word shown in the video"
            checked={value.proofRequirements.uniqueKey}
            onChange={(v) => setProof("uniqueKey", v)}
            icon={<KeyRound className="w-3 h-3" />}
          />
        </div>
      </div>

      {/* Unique key fields (conditional) */}
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
              onChange={(e) =>
                onChange({ ...value, uniqueKey: e.target.value })
              }
              placeholder="e.g. EARNGPT-123"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Compared case-insensitive after trimming. Wrong keys are
              auto-rejected.
            </p>
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
              placeholder="e.g. 'What word appeared at 0:30?'"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* The legacy honor-based engagement checklist was replaced by the typed
          Proof steps below (Like / Comment / Subscribe with real screenshot +
          link proof). Existing tasks are auto-converted to steps on load. */}

      {/* Sequential proof steps (new flow) — one at a time, screenshot per step */}
      {(() => {
        const steps = value.steps ?? [];
        const setSteps = (next: VideoStep[]) =>
          onChange({ ...value, steps: next });
        const addStepOfType = (type: VideoStepType) =>
          setSteps([
            ...steps,
            {
              id: crypto.randomUUID(),
              type,
              label: defaultStepLabel(type),
              actionUrl: "",
              requireScreenshot: true,
              requireLink: false,
              required: true,
            },
          ]);
        const addStep = () => addStepOfType("like");
        const updateStep = (i: number, patch: Partial<VideoStep>) =>
          setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
        // Changing the type refreshes the (untouched) default label + sets a
        // sensible screenshot/link default; keeps a custom label the admin typed.
        const changeType = (i: number, type: VideoStepType) => {
          const s = steps[i];
          const wasDefault =
            !s.label.trim() ||
            Object.values(STEP_TYPE_META).some((m) => m.verb === s.label);
          updateStep(i, {
            type,
            ...(wasDefault ? { label: defaultStepLabel(type) } : {}),
          });
        };
        const removeStep = (i: number) =>
          setSteps(steps.filter((_, idx) => idx !== i));
        const moveStep = (i: number, dir: -1 | 1) => {
          const j = i + dir;
          if (j < 0 || j >= steps.length) return;
          const next = [...steps];
          [next[i], next[j]] = [next[j], next[i]];
          setSteps(next);
        };
        const inp =
          "w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500";
        return (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white inline-flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-indigo-400" />
                Proof steps <span className="text-gray-500 font-normal">(sequential)</span>
              </p>
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                Add step
              </button>
            </div>
            <p className="text-[11px] text-gray-500 -mt-1">
              Shown one at a time after the video collapses: the user opens the
              link, does the action (like / comment / subscribe / visit), submits
              the required proof (screenshot and/or link), and taps Save to unlock
              the next. <b>Optional</b> steps can be skipped. When all <b>required</b>
              steps are done a Complete button appears (→ ad → submit). Preferred
              over the simple checklist above (these capture real proof).
            </p>

            <div className="flex flex-wrap gap-1.5">
              {(["like", "comment", "subscribe", "link"] as VideoStepType[]).map(
                (tt) => (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => addStepOfType(tt)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {STEP_TYPE_META[tt].emoji} {STEP_TYPE_META[tt].label}
                  </button>
                )
              )}
            </div>

            {steps.length === 0 ? (
              <p className="text-xs text-gray-600">No steps yet.</p>
            ) : (
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-800 bg-gray-900 p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400">
                        Step {i + 1}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStep(i, -1)}
                          disabled={i === 0}
                          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(i, 1)}
                          disabled={i === steps.length - 1}
                          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(i)}
                          className="p-1 rounded text-red-400 hover:text-red-300"
                          aria-label="Remove step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={s.type ?? "custom"}
                        onChange={(e) =>
                          changeType(i, e.target.value as VideoStepType)
                        }
                        className="px-2 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        {(
                          ["like", "comment", "subscribe", "link", "custom"] as VideoStepType[]
                        ).map((tt) => (
                          <option key={tt} value={tt}>
                            {STEP_TYPE_META[tt].emoji} {STEP_TYPE_META[tt].label}
                          </option>
                        ))}
                      </select>
                      <label className="ml-auto flex items-center gap-1.5 cursor-pointer text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={s.required !== false}
                          onChange={(e) =>
                            updateStep(i, { required: e.target.checked })
                          }
                          className="rounded bg-gray-800 border-gray-600 text-emerald-500"
                        />
                        Required
                      </label>
                    </div>
                    <input
                      value={s.label}
                      onChange={(e) => updateStep(i, { label: e.target.value })}
                      placeholder="Instruction shown to the user"
                      className={inp}
                    />
                    <input
                      value={s.actionUrl ?? ""}
                      onChange={(e) =>
                        updateStep(i, { actionUrl: e.target.value })
                      }
                      placeholder={`${STEP_TYPE_META[s.type ?? "custom"].urlLabel}, e.g. https://…`}
                      className={inp}
                    />
                    {(s.type ?? "custom") === "comment" && (
                      <textarea
                        value={s.commentTemplate ?? ""}
                        onChange={(e) =>
                          updateStep(i, { commentTemplate: e.target.value })
                        }
                        placeholder="Suggested comment text the user can copy (optional)"
                        rows={2}
                        className={inp}
                      />
                    )}
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={s.requireScreenshot}
                          onChange={(e) =>
                            updateStep(i, { requireScreenshot: e.target.checked })
                          }
                          className="rounded bg-gray-800 border-gray-600 text-indigo-500"
                        />
                        <Camera className="w-3.5 h-3.5" />
                        Require screenshot
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={!!s.requireLink}
                          onChange={(e) =>
                            updateStep(i, { requireLink: e.target.checked })
                          }
                          className="rounded bg-gray-800 border-gray-600 text-indigo-500"
                        />
                        <Link2 className="w-3.5 h-3.5" />
                        Require link
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {steps.length > 0 && (
              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900 cursor-pointer hover:border-gray-700">
                <input
                  type="checkbox"
                  checked={!!value.autoApprove}
                  onChange={(e) =>
                    onChange({ ...value, autoApprove: e.target.checked })
                  }
                  className="mt-0.5 rounded bg-gray-800 border-gray-600 text-emerald-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-white inline-flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Auto-approve
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    On: the user is approved right after the ad (instant points).
                    Off: the submission goes to <b>Pending</b> — you approve it in
                    the review queue to pay out.
                  </p>
                </div>
              </label>
            )}
          </div>
        );
      })()}
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
