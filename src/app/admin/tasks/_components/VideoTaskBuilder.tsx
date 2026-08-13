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
} from "lucide-react";
import {
  type VideoConfig,
  type VideoStep,
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

      {/* Auto-submit toggle */}
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
            Auto-submit
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            When watch time ends, submit fires automatically — no extra tap
            needed. Recommended for simple watch tasks.
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

      {/* YouTube-style engagement (optional) — subscribe / like / comment */}
      {(() => {
        const eng = value.engagement ?? {
          requireSubscribe: false,
          requireLike: false,
          requireComment: false,
        };
        const setEng = (patch: Partial<NonNullable<VideoConfig["engagement"]>>) =>
          onChange({ ...value, engagement: { ...eng, ...patch } });
        return (
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-3">
            <p className="text-sm font-bold text-white">
              ▶️ YouTube engagement <span className="text-gray-500 font-normal">(optional)</span>
            </p>
            <p className="text-[11px] text-gray-500 -mt-1">
              Bundle subscribe/like/comment with the watch. If <b>Screenshot</b> proof
              is on, engagement is manually reviewed; otherwise it&apos;s honor-based and
              auto-approves (guarded by the user&apos;s trust score).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ProofToggle
                label="Require Subscribe"
                help="User subscribes to the channel"
                checked={eng.requireSubscribe}
                onChange={(v) => setEng({ requireSubscribe: v })}
              />
              <ProofToggle
                label="Require Like"
                help="User likes the video"
                checked={eng.requireLike}
                onChange={(v) => setEng({ requireLike: v })}
              />
              <ProofToggle
                label="Require Comment"
                help="User comments on the video"
                checked={eng.requireComment}
                onChange={(v) => setEng({ requireComment: v })}
              />
            </div>
            {eng.requireSubscribe && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Channel URL <span className="text-red-400">*</span>
                </label>
                <input
                  value={eng.channelUrl ?? ""}
                  onChange={(e) => setEng({ channelUrl: e.target.value })}
                  placeholder="https://youtube.com/@channel"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
            {eng.requireComment && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Suggested comment (optional)
                </label>
                <textarea
                  rows={2}
                  value={eng.commentTemplate ?? ""}
                  onChange={(e) => setEng({ commentTemplate: e.target.value })}
                  placeholder="Text the user can copy and post as their comment"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Sequential proof steps (new flow) — one at a time, screenshot per step */}
      {(() => {
        const steps = value.steps ?? [];
        const setSteps = (next: VideoStep[]) =>
          onChange({ ...value, steps: next });
        const addStep = () =>
          setSteps([
            ...steps,
            { id: crypto.randomUUID(), label: "", requireScreenshot: true },
          ]);
        const updateStep = (i: number, patch: Partial<VideoStep>) =>
          setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
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
              Shown one at a time after the video: the user does each step,
              uploads a screenshot, and taps Save to unlock the next. When all
              steps are done a Complete button appears (→ ad → submit). Leave
              empty to use the simple checklist above.
            </p>

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
                    <input
                      value={s.label}
                      onChange={(e) => updateStep(i, { label: e.target.value })}
                      placeholder="Instruction, e.g. Subscribe to the channel"
                      className={inp}
                    />
                    <input
                      value={s.actionUrl ?? ""}
                      onChange={(e) =>
                        updateStep(i, { actionUrl: e.target.value })
                      }
                      placeholder="Action link (optional), e.g. https://youtube.com/@channel"
                      className={inp}
                    />
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
