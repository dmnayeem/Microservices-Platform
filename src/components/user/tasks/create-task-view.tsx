"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Share2, Sparkles, Wallet, Target } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";

type TaskType = "SOCIAL" | "CUSTOM";

const EMPTY_AUDIENCE: TaskAudienceValue = {
  countries: [],
  genders: [],
  minAge: null,
  maxAge: null,
  regions: [],
  divisions: [],
  districts: [],
  subDistricts: [],
  postalCodes: [],
};

export function CreateTaskView({
  pointsPerUsd = 1000,
  canTarget = false,
}: {
  pointsPerUsd?: number;
  /** When true, the user may set audience targeting (admin-granted `targetTasks`). */
  canTarget?: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<TaskType>("SOCIAL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // SOCIAL
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialAction, setSocialAction] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  // CUSTOM
  const [instructions, setInstructions] = useState("");
  // Rewards
  const [pointsReward, setPointsReward] = useState(50);
  const [targetCount, setTargetCount] = useState(10);
  const [minLevel, setMinLevel] = useState(1);
  const [audience, setAudience] = useState<TaskAudienceValue>(EMPTY_AUDIENCE);
  const [busy, setBusy] = useState(false);

  const budget = Math.max(0, Math.floor(pointsReward) * Math.floor(targetCount));
  const budgetUsd = (budget / (pointsPerUsd || 1000)).toFixed(2);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description required");
      return;
    }
    if (pointsReward < 1 || targetCount < 1) {
      toast.error("Reward and target count must be at least 1");
      return;
    }
    if (type === "SOCIAL" && (!socialUrl.trim() || !socialAction.trim())) {
      toast.error("Social tasks need an action and a target URL");
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        type,
        pointsReward: Math.floor(pointsReward),
        targetCount: Math.floor(targetCount),
        minLevel: Math.max(1, Math.floor(minLevel)),
      };
      if (type === "SOCIAL") {
        body.socialPlatform = socialPlatform.trim() || undefined;
        body.socialAction = socialAction.trim();
        body.socialUrl = socialUrl.trim();
      } else {
        body.instructions = instructions.trim() || undefined;
      }
      if (canTarget) {
        body.countries = audience.countries;
        body.genders = audience.genders;
        body.regions = audience.regions;
        body.divisions = audience.divisions;
        body.districts = audience.districts;
        body.subDistricts = audience.subDistricts;
        body.postalCodes = audience.postalCodes;
        body.minAge = audience.minAge;
        body.maxAge = audience.maxAge;
      }

      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        toast.error("Insufficient wallet funds", {
          description:
            d?.error ||
            (typeof d?.shortBy === "number"
              ? `You're short by ${d.shortBy} points.`
              : "Top up your wallet and try again."),
        });
        return;
      }
      if (res.status === 403) {
        toast.error("Creating tasks isn't available on your plan");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed to submit task");
      }

      toast.success("Task submitted for review");
      router.push("/tasks");
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
      <div>
        <h1 className="text-xl font-bold text-white">Create Task</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Fund a task from your wallet. It goes live after admin review.
        </p>
      </div>

      {/* Type toggle */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { value: "SOCIAL", label: "Social", icon: Share2 },
            { value: "CUSTOM", label: "Custom", icon: Sparkles },
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const active = type === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                active
                  ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                  : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-600"
              }`}
            >
              <Icon className="w-4 h-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="What should people do?"
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
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
            placeholder="Describe the task for participants..."
            className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {type === "SOCIAL" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Platform
                </label>
                <input
                  value={socialPlatform}
                  onChange={(e) => setSocialPlatform(e.target.value)}
                  placeholder="e.g. YouTube, Instagram"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Action *
                </label>
                <input
                  value={socialAction}
                  onChange={(e) => setSocialAction(e.target.value)}
                  placeholder="Follow / Like / Subscribe"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Target URL *
              </label>
              <input
                value={socialUrl}
                onChange={(e) => setSocialUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Instructions
            </label>
            <textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions for completing this task..."
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Points reward
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={pointsReward}
              onChange={(e) => setPointsReward(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Completions
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              How many completions to fund
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Min level
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={minLevel}
              onChange={(e) => setMinLevel(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Audience targeting — only when admin-granted */}
      {canTarget && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <Target className="w-4 h-4 text-indigo-400" /> Audience targeting
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Optional. Limit who can do this task by country / area, gender and
              age. Leave empty to reach everyone.
            </p>
          </div>
          <TaskAudienceTargeting value={audience} onChange={(patch) => setAudience((a) => ({ ...a, ...patch }))} />
        </div>
      )}

      {/* Live cost estimate */}
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white tabular-nums">
              {budget.toLocaleString()}
            </span>
            <span className="text-sm text-gray-400">pts</span>
            <span className="text-sm text-gray-500">
              ≈ ${budgetUsd}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {pointsReward.toLocaleString()} pts × {targetCount.toLocaleString()}{" "}
            completions. Funded from your wallet; refunded if rejected.
          </p>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Submit for review
      </button>
    </div>
  );
}
