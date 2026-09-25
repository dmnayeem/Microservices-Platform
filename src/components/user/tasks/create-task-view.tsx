"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Send,
  Share2,
  Sparkles,
  Wallet,
  Target,
  PlayCircle,
  ClipboardList,
  HelpCircle,
  PenLine,
  Smartphone,
  Users,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CustomTaskBuilder } from "@/app/admin/tasks/_components/CustomTaskBuilder";
import type { CustomConfig } from "@/lib/custom-tasks";
import { BUYER_CUSTOM_NOTICE } from "@/lib/buyer-task-configs";
import { usd, pts, cn } from "@/lib/utils";
import Link from "next/link";
import { TASK_CREDIT } from "@/lib/task-credit-theme";
import { quoteTask } from "@/lib/buyer-quote";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";
import {
  SurveyBuilder,
  emptySurveyDraft,
  surveyDraftProblem,
  type SurveyDraft,
} from "@/components/user/tasks/survey-builder";
import {
  QuizBuilder,
  emptyQuizDraft,
  quizDraftProblem,
  type QuizDraft,
  ArticleBuilder,
  emptyArticleDraft,
  articleDraftProblem,
  type ArticleDraft,
  AppInstallBuilder,
  emptyAppInstallDraft,
  appInstallDraftProblem,
  type AppInstallDraft,
} from "@/components/user/tasks/buyer-type-builders";

type TaskType =
  | "SOCIAL"
  | "VIDEO"
  | "CUSTOM"
  | "SURVEY"
  | "QUIZ"
  | "ARTICLE"
  | "APPINSTALL";

export interface BuyerPlatform {
  key: string;
  label: string;
  emoji: string;
  actions: { key: string; label: string }[];
}

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
  pointsPerUsd,
  canTarget = false,
  feePercent = 0,
  minPoints = 1,
  maxPoints = 100000,
  maxCompletions = 100000,
  allowedTypes = ["SOCIAL", "CUSTOM"],
  needsReview = true,
  taskCredit = 0,
  platforms = [],
  suspendedNote = "",
}: {
  pointsPerUsd?: number;
  /** When true, the user may set audience targeting (admin-granted `targetTasks`). */
  canTarget?: boolean;
  /** Platform commission, from the admin Buyer & Task Funding settings. */
  feePercent?: number;
  minPoints?: number;
  maxPoints?: number;
  maxCompletions?: number;
  allowedTypes?: string[];
  /** False when the admin publishes buyer tasks without review. */
  needsReview?: boolean;
  /** The buyer's task-credit balance, in points. This is what funds the task. */
  taskCredit?: number;
  /**
   * Platforms this buyer may target, already filtered by the admin's global
   * list and this account's own suspensions. The form never offers anything
   * the server would refuse.
   */
  platforms?: BuyerPlatform[];
  /** Why something is suspended on this account, if anything is. */
  suspendedNote?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<TaskType>(
    allowedTypes.includes("SOCIAL") ? "SOCIAL" : "CUSTOM"
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // SOCIAL
  const [socialPlatform, setSocialPlatform] = useState("");
  const [socialAction, setSocialAction] = useState("");
  // Actions are per-platform, so a platform change must clear the action —
  // otherwise "Follow" from Instagram survives a switch to Spotify and the
  // server refuses something the form appeared to accept.
  const pickPlatform = (key: string) => {
    setSocialPlatform(key);
    setSocialAction("");
  };
  const platformDef = platforms.find((p) => p.key === socialPlatform);
  const [socialUrl, setSocialUrl] = useState("");
  // VIDEO
  const [videoUrl, setVideoUrl] = useState("");
  const [watchSeconds, setWatchSeconds] = useState(30);
  // CUSTOM
  const [instructions, setInstructions] = useState("");
  // What the worker must hand back. Without at least one field a custom task
  // is a mark-done button: the worker is paid and the buyer receives nothing.
  const [customCfg, setCustomCfg] = useState<CustomConfig>({
    fields: [],
    introMessage: "",
    thankYouMessage: "",
    autoApprove: false,
  });
  // SURVEY
  const [survey, setSurvey] = useState<SurveyDraft>(emptySurveyDraft);
  const [quiz, setQuiz] = useState<QuizDraft>(emptyQuizDraft);
  const [article, setArticle] = useState<ArticleDraft>(emptyArticleDraft);
  const [appInstall, setAppInstall] =
    useState<AppInstallDraft>(emptyAppInstallDraft);
  // Rewards
  const [pointsReward, setPointsReward] = useState(50);
  const [targetCount, setTargetCount] = useState(10);
  const [minLevel, setMinLevel] = useState(1);
  const [audience, setAudience] = useState<TaskAudienceValue>(EMPTY_AUDIENCE);
  const [busy, setBusy] = useState(false);

  // The SAME function the server prices the charge with, so the number on this
  // screen and the number debited cannot drift apart.
  const quote = quoteTask({
    pointsPerCompletion: pointsReward,
    completions: targetCount,
    pointsPerUsd: pointsPerUsd || 1000,
    feePercent,
  });
  const budget = quote.budgetPoints;

  // ── Who will actually see this, and how long it should take ────────────────
  //
  // A buyer could pick a country, an age window and a minimum level and press
  // Create with no idea whether that described forty thousand people or nobody.
  // A task matching nobody looks exactly like a task nobody has got to yet, so
  // the mistake stayed invisible until they gave up on it.
  //
  // Shape declared here rather than imported: `buyer-reach.ts` is `server-only`
  // and importing it would drag Prisma into this bundle.
  const [reach, setReach] = useState<{
    eligible: number | null;
    tooNarrow: boolean;
    empty: boolean;
    activeRecently: number | null;
    perTaskPerDay: number | null;
    sampleSize: number;
    sampleMedianReward: number | null;
    daysToFill: number | null;
  } | null>(null);
  const [reachLoading, setReachLoading] = useState(false);

  useEffect(() => {
    // Debounced: this runs on every keystroke in the reward and completion
    // boxes, and it counts users.
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setReachLoading(true);
      fetch("/api/tasks/mine/reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          minLevel,
          targetCount,
          pointsReward,
          ...audience,
        }),
        signal: ctl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setReach(d))
        .catch(() => {
          /* aborted, or offline — the panel simply shows nothing */
        })
        .finally(() => setReachLoading(false));
    }, 500);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [type, minLevel, targetCount, pointsReward, audience]);

  // Admin bounds, surfaced before submit rather than as a server rejection.
  // What one completion costs — reward plus its share of the fee. This is the
  // real gate: a task is publishable when the buyer can pay for one, because
  // credit is charged per completion rather than reserved for all of them.
  const perCompletion =
    pointsReward +
    (feePercent > 0 ? Math.ceil((pointsReward * feePercent) / 100) : 0);
  const shortBy = Math.max(0, perCompletion - taskCredit);
  const limitError =
    pointsReward < minPoints
      ? `Minimum reward is ${minPoints.toLocaleString()} points per completion.`
      : pointsReward > maxPoints
        ? `Maximum reward is ${maxPoints.toLocaleString()} points per completion.`
        : targetCount > maxCompletions
          ? `One task can be funded for at most ${maxCompletions.toLocaleString()} completions.`
          : null;

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description required");
      return;
    }
    if (pointsReward < 1 || targetCount < 1) {
      toast.error("Reward and target count must be at least 1");
      return;
    }
    if (type === "VIDEO" && !videoUrl.trim()) {
      toast.error("Add the link to your video");
      return;
    }
    if (type === "SOCIAL" && (!socialUrl.trim() || !socialAction.trim())) {
      toast.error("Social tasks need an action and a target URL");
      return;
    }
    // Every payload-carrying type checks the SAME rules the server will, so a
    // buyer is told what is wrong before they submit, not after.
    const problem =
      type === "SURVEY"
        ? surveyDraftProblem(survey)
        : type === "QUIZ"
          ? quizDraftProblem(quiz)
          : type === "ARTICLE"
            ? articleDraftProblem(article)
            : type === "APPINSTALL"
              ? appInstallDraftProblem(appInstall)
              : null;
    if (problem) {
      toast.error(problem);
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
      if (type === "VIDEO") {
        body.videoUrl = videoUrl.trim();
        body.watchSeconds = Math.max(5, Math.floor(watchSeconds));
      }
      if (type === "SURVEY") {
        body.survey = {
          questions: survey.questions.map((q, i) => ({ ...q, order: i })),
          introMessage: survey.introMessage.trim() || undefined,
          thankYouMessage: survey.thankYouMessage.trim() || undefined,
          randomizeQuestions: survey.randomizeQuestions,
          shuffleOptions: survey.shuffleOptions,
        };
      }
      if (type === "QUIZ") {
        body.quiz = {
          questions: quiz.questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctIndex: q.correctIndex,
            explanation: q.explanation.trim() || undefined,
          })),
        };
      }
      if (type === "ARTICLE") {
        body.article = {
          brief: article.brief.trim(),
          minWords: Math.floor(article.minWords),
          requireUrl: article.requireUrl,
          requireScreenshot: article.requireScreenshot,
        };
      }
      if (type === "APPINSTALL") {
        body.appInstall = {
          appName: appInstall.appName.trim(),
          appKind: appInstall.appKind,
          description: appInstall.description.trim() || undefined,
          playStoreUrl: appInstall.playStoreUrl.trim() || undefined,
          appStoreUrl: appInstall.appStoreUrl.trim() || undefined,
          proofItems: appInstall.proofItems.map((p) => ({
            kind: p.kind,
            label: p.label.trim() || undefined,
            target: p.target > 0 ? p.target : undefined,
            screenshot: p.screenshot,
            valueLabel: p.valueLabel.trim() || undefined,
          })),
        };
      }
      if (type === "SOCIAL") {
        body.socialPlatform = socialPlatform.trim() || undefined;
        body.socialAction = socialAction.trim();
        body.socialUrl = socialUrl.trim();
      } else {
        body.instructions = instructions.trim() || undefined;
      }
      if (type === "CUSTOM") {
        body.custom = {
          fields: customCfg.fields,
          introMessage: customCfg.introMessage || undefined,
          thankYouMessage: customCfg.thankYouMessage || undefined,
        };
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
        <p className="text-sm text-(--app-ink-3) mt-0.5">
          Fund a task from your wallet. It goes live after admin review.
        </p>
      </div>

      {suspendedNote && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
          Some options are suspended on your account: {suspendedNote}
        </p>
      )}

      {/* Type toggle. Only the types the admin allows buyers to create — an
          option that the API will refuse is worse than no option. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { value: "SOCIAL", label: "Social", icon: Share2 },
            { value: "VIDEO", label: "Video", icon: PlayCircle },
            { value: "CUSTOM", label: "Custom", icon: Sparkles },
            { value: "SURVEY", label: "Survey", icon: ClipboardList },
            { value: "QUIZ", label: "Quiz", icon: HelpCircle },
            { value: "ARTICLE", label: "Article", icon: PenLine },
            { value: "APPINSTALL", label: "App install", icon: Smartphone },
          ] as const
        )
          .filter((opt) => allowedTypes.includes(opt.value))
          .map((opt) => {
          const Icon = opt.icon;
          const active = type === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                active
                  ? "border-(--app-accent-edge) bg-(--app-cta)/10 text-(--app-accent-ink)"
                  : "border-(--app-line) bg-(--app-page) text-(--app-ink-3) hover:border-(--app-line)"
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
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="What should people do?"
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
            Description *
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task for participants..."
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) resize-none"
          />
        </div>

        {type === "VIDEO" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
                Video link
              </label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2.5 text-sm text-(--app-ink) focus:border-(--app-accent-edge) focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-(--app-ink-3)">
                YouTube, Facebook, Vimeo or a direct video file.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
                How long must they watch? (seconds)
              </label>
              <input
                type="number"
                min={5}
                max={3600}
                value={watchSeconds}
                onChange={(e) =>
                  setWatchSeconds(parseInt(e.target.value) || 30)
                }
                className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2.5 text-sm text-(--app-ink) focus:border-(--app-accent-edge) focus:outline-none"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-(--app-ink-3)">
                Watch time is counted on our server while the video is actually
                playing and in view — it is not something the viewer can claim.
              </p>
            </div>
          </div>
        ) : type === "SOCIAL" ? (
          <>
            {/* Real platforms and real actions, from the same catalog the
                admin builder uses. This was two free-text boxes, which meant a
                buyer's task matched no known platform — so it got none of the
                per-platform copy-steps and none of the automatic link
                verification, and every submission fell to manual review. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                  Platform *
                </label>
                <select
                  value={socialPlatform}
                  onChange={(e) => pickPlatform(e.target.value)}
                  className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
                >
                  <option value="">Choose…</option>
                  {platforms.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.emoji} {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                  Action *
                </label>
                <select
                  value={socialAction}
                  onChange={(e) => setSocialAction(e.target.value)}
                  disabled={!platformDef}
                  className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge) disabled:opacity-50"
                >
                  <option value="">
                    {platformDef ? "Choose…" : "Pick a platform first"}
                  </option>
                  {platformDef?.actions.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                Target URL *
              </label>
              <input
                value={socialUrl}
                onChange={(e) => setSocialUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
              />
            </div>
          </>
        ) : type === "SURVEY" ? (
          <SurveyBuilder value={survey} onChange={setSurvey} />
        ) : type === "QUIZ" ? (
          <QuizBuilder value={quiz} onChange={setQuiz} />
        ) : type === "ARTICLE" ? (
          <ArticleBuilder value={article} onChange={setArticle} />
        ) : type === "APPINSTALL" ? (
          <AppInstallBuilder value={appInstall} onChange={setAppInstall} />
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
              Instructions
            </label>
            <textarea
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step instructions for completing this task..."
              className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) resize-none"
            />

            {type === "CUSTOM" && (
              <div className="space-y-2">
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-100/90">
                  {BUYER_CUSTOM_NOTICE}
                </p>
                <CustomTaskBuilder value={customCfg} onChange={setCustomCfg} />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
              Points reward
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={pointsReward}
              onChange={(e) => setPointsReward(Number(e.target.value))}
              className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
              Completions
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={targetCount}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
            />
            <p className="text-[10px] text-(--app-ink-3) mt-1">
              How many completions to fund
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
              Min level
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={minLevel}
              onChange={(e) => setMinLevel(Number(e.target.value))}
              className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-(--app-accent-edge)"
            />
          </div>
        </div>
      </div>

      {/* Audience targeting — only when admin-granted */}
      {canTarget && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <Target className="w-4 h-4 text-(--app-accent-ink)" /> Audience targeting
            </h2>
            <p className="text-[11px] text-(--app-ink-3) mt-0.5">
              Optional. Limit who can do this task by country / area, gender and
              age. Leave empty to reach everyone.
            </p>
          </div>
          <TaskAudienceTargeting value={audience} onChange={(patch) => setAudience((a) => ({ ...a, ...patch }))} />
        </div>
      )}

      {/* Reach — who this can be shown to, and roughly how fast it will fill.
          Measured, not modelled: the audience count uses the same STRICT rule
          the serve query enforces, and the pace comes from what tasks of this
          type have actually been completed at. */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Users className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              Who this can reach
            </p>
            <p className="text-[11px] text-(--app-ink-3)">
              {reachLoading
                ? "Checking…"
                : reach === null
                  ? "We couldn't work this out right now."
                  : reach.empty
                    ? "Nobody matches this audience."
                    : reach.tooNarrow
                      ? "Fewer than 10 people match this audience."
                      : `${(reach.eligible ?? 0).toLocaleString()} people match${
                          reach.activeRecently !== null
                            ? ` · ${reach.activeRecently.toLocaleString()} signed in this month`
                            : ""
                        }`}
            </p>
          </div>
        </div>

        {reach && (reach.empty || reach.tooNarrow) && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              {reach.empty
                ? "Nobody on the platform matches every one of these filters, so this task would be published and shown to no one. Widen the targeting or lower the minimum level."
                : "This audience is very small, so expect it to fill slowly or not at all. Widening one filter usually helps more than raising the reward."}
            </p>
          </div>
        )}

        {reach && !reach.empty && !reach.tooNarrow && (
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-(--app-ink-3)">
                <Clock className="mr-1 inline h-3.5 w-3.5 text-(--app-ink-3)" />
                Should fill in
              </span>
              <span className="tabular-nums text-(--app-ink)">
                {reach.daysToFill === null
                  ? "no history yet"
                  : reach.daysToFill <= 1
                    ? "about a day"
                    : `about ${reach.daysToFill} days`}
              </span>
            </div>
            {reach.sampleSize > 0 && (
              <p className="text-[11px] leading-relaxed text-(--app-ink-3)">
                Based on {reach.sampleSize} task
                {reach.sampleSize === 1 ? "" : "s"} of this kind over the last 30
                days
                {reach.sampleMedianReward !== null && (
                  <>
                    , where the typical reward was{" "}
                    {reach.sampleMedianReward.toLocaleString()} pts
                    {pointsReward < reach.sampleMedianReward && (
                      <>
                        {" "}
                        — yours is lower, so expect it to be slower than this
                      </>
                    )}
                  </>
                )}
                . It is an estimate, not a promise.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Invoice — what this task costs, itemised before you commit to it. */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-(--app-cta)/10 ring-1 ring-(--app-accent-edge)/20 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-(--app-accent-ink)" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">If everyone completes it</p>
            <p className="text-[11px] text-(--app-ink-3)">
              {pointsReward.toLocaleString()} pts ×{" "}
              {targetCount.toLocaleString()} completions
            </p>
          </div>
        </div>

        {/* Priced in POINTS, because task credit is what actually pays for
            this. The dollar value trails as a reference so the buyer can still
            see what it is worth. */}
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-(--app-ink-3)">Reward pool</span>
            <span className="tabular-nums text-(--app-ink)">
              {pts(budget)} pts
            </span>
          </div>
          {feePercent > 0 && (
            <div className="flex justify-between">
              <span className="text-(--app-ink-3)">Platform fee ({feePercent}%)</span>
              <span className="tabular-nums text-(--app-ink)">
                {pts(quote.feePoints)} pts
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-white/10 pt-1.5 font-bold">
            <span className="text-white">Most it can cost</span>
            <span className={cn("tabular-nums", TASK_CREDIT.textStrong)}>
              {pts(quote.totalPoints)} pts
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-(--app-ink-3)">Worth about</span>
            <span className="tabular-nums text-(--app-ink-3)">
              {usd(quote.totalUsd)}
            </span>
          </div>
        </div>

        {/* Balance after, so a buyer knows whether they can run this at all
            before writing the whole thing. */}
        <div
          className={cn(
            "mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs",
            shortBy > 0
              ? "border-amber-500/30 bg-amber-500/10"
              : cn(TASK_CREDIT.border, TASK_CREDIT.bg)
          )}
        >
          <span className={shortBy > 0 ? "text-amber-300" : "text-(--app-ink-3)"}>
            {shortBy > 0
              ? `You need at least ${pts(shortBy)} more credit to publish this`
              : `Your credit: ${pts(taskCredit)} — enough for ${Math.floor(
                  taskCredit / Math.max(1, perCompletion)
                ).toLocaleString()} completion${
                  Math.floor(taskCredit / Math.max(1, perCompletion)) === 1
                    ? ""
                    : "s"
                }`}
          </span>
          {shortBy > 0 && (
            <Link
              href="/buy-points"
              className="shrink-0 rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 font-semibold text-amber-200 hover:bg-amber-400/25"
            >
              Buy credit
            </Link>
          )}
        </div>

        <div className="mt-3 space-y-1 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-(--app-ink-3)">
          <p>
            <span className="font-semibold text-(--app-ink-2)">
              Nothing is charged now.
            </span>{" "}
            Credit comes out as people complete the task —{" "}
            {pts(pointsReward)} pts each
            {feePercent > 0 ? ` plus ${feePercent}% fee` : ""}. If 10 of{" "}
            {targetCount.toLocaleString()} complete it, you pay for 10.
          </p>
          <p>
            The task switches itself off as soon as your credit can&rsquo;t
            cover one more completion, so nobody works for a reward you
            can&rsquo;t pay.
          </p>
          <p>
            {needsReview
              ? "An admin reviews it before it goes live. A rejected task costs you nothing."
              : "It goes live immediately. A task that is later rejected costs you nothing."}
          </p>
        </div>
      </div>

      {limitError && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {limitError}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy || !!limitError || shortBy > 0}
        className="w-full py-3 rounded-xl bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {needsReview ? "Submit for review" : "Publish task"}
      </button>
    </div>
  );
}
