"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, FileText, HelpCircle, ClipboardList, Share2, Globe, Gift, Sparkles, Save, X, Plus, Trash2, AlertCircle, Loader2, Image as ImageIcon, Smartphone } from "lucide-react";
import { MediaSelector } from "@/components/media/MediaSelector";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { notifyCenter } from "@/lib/notify-center";
import type { MediaItem } from "@/types/media";
import { SocialTaskBuilder } from "./SocialTaskBuilder";
import { ArticleTaskBuilder } from "./ArticleTaskBuilder";
import { VideoTaskBuilder } from "./VideoTaskBuilder";
import { SurveyTaskBuilder } from "./SurveyTaskBuilder";
import { CustomTaskBuilder } from "./CustomTaskBuilder";
import {
  emptyBundleConfig,
  normalizeSocialConfig,
  validateSocialBundle,
  bundleTotalPoints,
  type SocialBundleConfig,
} from "@/lib/social-tasks";
import { emptyArticleConfig, validateArticleConfig, type ArticleConfig } from "@/lib/article-tasks";
import { emptyVideoConfig, validateVideoConfig, type VideoConfig } from "@/lib/video-tasks";
import {
  emptySurveyConfig,
  validateSurveyConfig,
  type SurveyConfig,
} from "@/lib/survey-tasks";
import {
  DEFAULT_CUSTOM_CONFIG,
  validateCustomConfig,
  type CustomConfig,
} from "@/lib/custom-tasks";
import { AppInstallTaskBuilder } from "./AppInstallTaskBuilder";
import {
  validateAppInstallConfig,
  normalizeAppInstallConfig,
  type AppInstallConfig,
} from "@/lib/app-install-tasks";

// Task types with icons and colors
const taskTypes = [
  { id: "VIDEO", label: "Video", icon: Video, color: "red", description: "Watch videos to earn" },
  { id: "ARTICLE", label: "Article", icon: FileText, color: "blue", description: "Read articles to earn" },
  { id: "QUIZ", label: "Quiz", icon: HelpCircle, color: "amber", description: "Answer quiz questions" },
  { id: "SURVEY", label: "Survey", icon: ClipboardList, color: "purple", description: "Complete surveys" },
  { id: "SOCIAL", label: "Social", icon: Share2, color: "pink", description: "Social media engagement" },
  { id: "PROXY", label: "Proxy", icon: Globe, color: "cyan", description: "Geo-targeted browsing" },
  { id: "OFFERWALL", label: "Offerwall", icon: Gift, color: "emerald", description: "Complete offers" },
  { id: "APPINSTALL", label: "App Install", icon: Smartphone, color: "emerald", description: "Install an app + proof" },
  { id: "CUSTOM", label: "Custom", icon: Sparkles, color: "indigo", description: "Custom task type" },
];

// Note: social platform / action lists now live in src/lib/social-tasks.ts
// (SOCIAL_PLATFORMS) and are sourced via the SocialTaskBuilder component.

const countries = [
  { code: "ALL", name: "All Countries" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "NL", name: "Netherlands" },
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
];

interface TaskFormProps {
  task?: {
    id: string;
    title: string;
    description: string;
    instructions: string | null;
    instructionVideoUrl: string | null;
    type: string;
    status: string;
    pointsReward: number;
    xpReward: number;
    dailyLimit: number | null;
    totalLimit: number | null;
    minLevel: number;
    requiredAccessLevel: number;
    order: number;
    countries: string[];
    contentUrl: string | null;
    thumbnailUrl: string | null;
    duration: number | null;
    questions: unknown;
    socialPlatform: string | null;
    socialAction: string | null;
    socialUrl: string | null;
    // Stored config may be legacy v1 or v2 bundle; normalized on load.
    socialConfig?: unknown;
    articleConfig?: ArticleConfig | null;
    videoConfig?: VideoConfig | null;
    surveyConfig?: SurveyConfig | null;
    customConfig?: CustomConfig | null;
    appInstallConfig?: AppInstallConfig | null;
    proxyInstructions: string | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    cooldownMinutes: number;
    autoApprove: boolean;
    boardId?: string | null;
  };
}

interface QuizQuestion {
  question: string;
  imageUrl?: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export function TaskForm({ task }: TaskFormProps) {
  const router = useRouter();
  // After the in-place save creates a brand-new task, we hold its id
  // here so subsequent saves PATCH the right row instead of POSTing
  // duplicates. Also surfaces the id to child components (the article
  // wizard) so they can save sectional changes immediately.
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const effectiveTaskId = task?.id ?? createdTaskId;
  const isEditing = !!effectiveTaskId;

  // Form state
  const [formData, setFormData] = useState({
    title: task?.title || "",
    description: task?.description || "",
    instructions: task?.instructions || "",
    instructionVideoUrl: task?.instructionVideoUrl || "",
    type: task?.type || "",
    pointsReward: task?.pointsReward || 0,
    xpReward: task?.xpReward || 0,
    dailyLimit: task?.dailyLimit || "",
    totalLimit: task?.totalLimit || "",
    minLevel: task?.minLevel || 1,
    requiredAccessLevel: task?.requiredAccessLevel ?? 0,
    order: task?.order ?? 0,
    countries: task?.countries || [],
    contentUrl: task?.contentUrl || "",
    thumbnailUrl: task?.thumbnailUrl || "",
    duration: task?.duration || "",
    socialPlatform: task?.socialPlatform || "",
    socialAction: task?.socialAction || "",
    socialUrl: task?.socialUrl || "",
    proxyInstructions: task?.proxyInstructions || "",
    startsAt: task?.startsAt ? new Date(task.startsAt).toISOString().slice(0, 16) : "",
    expiresAt: task?.expiresAt ? new Date(task.expiresAt).toISOString().slice(0, 16) : "",
    cooldownMinutes: task?.cooldownMinutes || 0,
    autoApprove: task?.autoApprove || false,
    boardId: task?.boardId || "",
  });

  // Task Boards available to assign — loaded once on mount
  const [boards, setBoards] = useState<
    Array<{ id: string; title: string; isActive: boolean; pointsReward: number; xpReward: number }>
  >([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/admin/boards")
      .then((r) => (r.ok ? r.json() : { boards: [] }))
      .then((d) => {
        if (cancel) return;
        const list: Array<{
          id: string;
          title: string;
          isActive: boolean;
          pointsReward: number;
          xpReward: number;
        }> = d.boards ?? [];
        setBoards(list.filter((b) => b.isActive));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  // Instructions steps
  const [instructionSteps, setInstructionSteps] = useState<string[]>(
    task?.instructions ? task.instructions.split("\n").filter(Boolean) : [""]
  );

  // Quiz questions
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    (task?.questions as QuizQuestion[]) || [
      { question: "", imageUrl: "", options: ["", "", "", ""], correctAnswer: 0, explanation: "" },
    ]
  );

  // Social task config (bundle). Legacy single-action tasks load as a 1-item bundle.
  const [socialConfig, setSocialConfig] = useState<SocialBundleConfig>(() => {
    const norm = normalizeSocialConfig(task?.socialConfig);
    return norm.platform || norm.items.length
      ? { platform: norm.platform, items: norm.items, version: 2 }
      : emptyBundleConfig();
  });

  // Article task config
  const [articleConfig, setArticleConfig] = useState<ArticleConfig>(
    task?.articleConfig ?? emptyArticleConfig()
  );

  // Video task config
  const [videoConfig, setVideoConfig] = useState<VideoConfig>(
    task?.videoConfig ?? emptyVideoConfig()
  );

  // Survey task config
  const [surveyConfig, setSurveyConfig] = useState<SurveyConfig>(
    task?.surveyConfig ?? emptySurveyConfig()
  );

  // Custom task config
  const [customConfig, setCustomConfig] = useState<CustomConfig>(
    task?.customConfig ?? DEFAULT_CUSTOM_CONFIG
  );

  // App-install task config
  const [appInstallConfig, setAppInstallConfig] = useState<AppInstallConfig>(
    task?.appInstallConfig ?? { appName: "", steps: [], autoApprove: false }
  );

  // Media selector state
  const [mediaSelectorOpen, setMediaSelectorOpen] = useState(false);
  const [mediaSelectorTarget, setMediaSelectorTarget] = useState<"thumbnail" | { type: "quiz"; index: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /**
   * Save the task without redirecting away from the form. Used by the
   * article-task wizard's Step 1 "Save Pages & Continue" / "Save as Draft"
   * buttons so the user doesn't have to click the outer "Create Task"
   * button first. Pass `isDraft: true` to create the task as PAUSED.
   * Returns the saved task's id (existing or newly-created), or null on
   * error. runSubmit already manages loading/error state.
   */
  const saveTaskInPlace = async (
    opts?: { isDraft?: boolean }
  ): Promise<string | null> => {
    const fakeEvent = {
      preventDefault: () => {},
    } as unknown as React.FormEvent;
    const result = await runSubmit(fakeEvent, opts?.isDraft ?? false, {
      redirect: false,
    });
    return result.taskId;
  };

  const handleSubmit = async (e: React.FormEvent, isDraft = false) => {
    await runSubmit(e, isDraft, { redirect: true });
  };

  const runSubmit = async (
    e: React.FormEvent,
    isDraft: boolean,
    opts: { redirect: boolean }
  ): Promise<{ taskId: string | null }> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // For SOCIAL tasks, validate the builder and override legacy fields
      let socialPlatformOut = formData.socialPlatform;
      let socialActionOut = formData.socialAction;
      let socialUrlOut = formData.socialUrl;
      let socialConfigOut: SocialBundleConfig | null = null;

      if (formData.type === "SOCIAL") {
        const v = validateSocialBundle(socialConfig);
        if (!v.ok) {
          throw new Error(v.error ?? "Invalid social bundle.");
        }
        const first = socialConfig.items[0];
        socialPlatformOut = socialConfig.platform ?? "";
        socialActionOut = first?.action ?? "";
        socialUrlOut =
          first?.fields.targetUrl ??
          first?.fields.targetHandle ??
          formData.socialUrl;
        socialConfigOut = socialConfig;
      }

      // For ARTICLE tasks, validate and prep config
      let articleConfigOut: ArticleConfig | null = null;
      let contentUrlOut = formData.contentUrl;
      if (formData.type === "ARTICLE") {
        const v = validateArticleConfig(articleConfig);
        if (!v.ok) throw new Error(v.error ?? "Invalid article config");
        if (articleConfig.useKeyPool) {
          // Pool mode: strip blank pages, back-fill contentUrl with first page url
          const cleanedPages = (articleConfig.pages ?? []).filter((p) =>
            p.url.trim()
          );
          articleConfigOut = {
            ...articleConfig,
            pages: cleanedPages,
            links: cleanedPages.map((p) => ({ url: p.url, label: p.label })),
          };
          contentUrlOut = cleanedPages[0]?.url ?? "";
        } else {
          // Legacy mode: strip blank links and back-fill contentUrl with first link
          articleConfigOut = {
            ...articleConfig,
            links: articleConfig.links.filter((l) => l.url.trim()),
          };
          contentUrlOut = articleConfigOut.links[0]?.url ?? "";
        }
      }

      // For VIDEO tasks, validate and prep config
      let videoConfigOut: VideoConfig | null = null;
      let durationOut: string | number = formData.duration;
      if (formData.type === "VIDEO") {
        const v = validateVideoConfig(videoConfig);
        if (!v.ok) throw new Error(v.error ?? "Invalid video config");
        videoConfigOut = videoConfig;
        contentUrlOut = videoConfig.videoUrl;
        durationOut = videoConfig.watchSeconds;
      }

      // For SURVEY tasks, validate and prep config
      let surveyConfigOut: SurveyConfig | null = null;
      if (formData.type === "SURVEY") {
        const v = validateSurveyConfig(surveyConfig);
        if (!v.ok) throw new Error(v.error ?? "Invalid survey config");
        surveyConfigOut = surveyConfig;
      }

      // For CUSTOM tasks, validate and prep config
      let customConfigOut: CustomConfig | null = null;
      if (formData.type === "CUSTOM") {
        const err = validateCustomConfig(customConfig);
        if (err) throw new Error(err);
        customConfigOut = customConfig;
      }

      // For APPINSTALL tasks, validate and prep config
      let appInstallConfigOut: AppInstallConfig | null = null;
      if (formData.type === "APPINSTALL") {
        const err = validateAppInstallConfig(appInstallConfig);
        if (err) throw new Error(err);
        appInstallConfigOut = normalizeAppInstallConfig(appInstallConfig);
      }

      // Prepare the data
      const submitData = {
        ...formData,
        // SOCIAL total = Σ item points (server re-computes authoritatively).
        pointsReward:
          formData.type === "SOCIAL"
            ? bundleTotalPoints(socialConfig.items)
            : formData.pointsReward,
        socialPlatform: socialPlatformOut,
        socialAction: socialActionOut,
        socialUrl: socialUrlOut,
        socialConfig: socialConfigOut,
        articleConfig: articleConfigOut,
        videoConfig: videoConfigOut,
        surveyConfig: surveyConfigOut,
        customConfig: customConfigOut,
        appInstallConfig: appInstallConfigOut,
        contentUrl: contentUrlOut,
        duration: durationOut
          ? parseInt(durationOut.toString())
          : null,
        instructions: instructionSteps.filter(Boolean).join("\n"),
        dailyLimit: formData.dailyLimit ? parseInt(formData.dailyLimit.toString()) : null,
        totalLimit: formData.totalLimit ? parseInt(formData.totalLimit.toString()) : null,
        order: parseInt((formData.order ?? 0).toString()) || 0,
        startsAt: formData.startsAt ? new Date(formData.startsAt).toISOString() : null,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        status: isDraft ? "PAUSED" : "ACTIVE",
        questions: formData.type === "QUIZ" ? questions : null,
        boardId: formData.boardId || null,
      };

      const url = effectiveTaskId
        ? `/api/admin/tasks/${effectiveTaskId}`
        : "/api/admin/tasks";
      const method = effectiveTaskId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save task");
      }

      // Parse the response to extract the saved task id (used by the
      // wizard's in-place save path).
      let savedTaskId: string | null = effectiveTaskId ?? null;
      try {
        const data = await response.json();
        if (data && data.task && typeof data.task.id === "string") {
          savedTaskId = data.task.id;
        }
      } catch {
        // ignore — we only care about the redirect path below
      }
      // Persist the new id locally so subsequent saves PATCH instead of
      // POSTing again, and so child components see the live id.
      if (savedTaskId && savedTaskId !== effectiveTaskId) {
        setCreatedTaskId(savedTaskId);
      }

      // Centered success popup (persists across the redirect — NotifyCenterHost
      // is mounted in the root layout).
      const okMsg = isDraft
        ? "Saved as draft"
        : effectiveTaskId
          ? "Task updated"
          : "Task created";
      notifyCenter.success(okMsg, "It's now in your task list.");

      if (opts.redirect) {
        router.push("/admin/tasks");
        router.refresh();
      }
      return { taskId: savedTaskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      // Centered error popup so the issue is visible without scrolling to the top.
      notifyCenter.error("Couldn't save task", message);
      return { taskId: null };
    } finally {
      setLoading(false);
    }
  };

  const addInstructionStep = () => {
    setInstructionSteps([...instructionSteps, ""]);
  };

  const removeInstructionStep = (index: number) => {
    setInstructionSteps(instructionSteps.filter((_, i) => i !== index));
  };

  const updateInstructionStep = (index: number, value: string) => {
    const newSteps = [...instructionSteps];
    newSteps[index] = value;
    setInstructionSteps(newSteps);
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { question: "", imageUrl: "", options: ["", "", "", ""], correctAnswer: 0, explanation: "" },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: unknown) => {
    const newQuestions = [...questions];
    if (field === "question") {
      newQuestions[index].question = value as string;
    } else if (field === "correctAnswer") {
      newQuestions[index].correctAnswer = value as number;
    } else if (field === "explanation") {
      newQuestions[index].explanation = value as string;
    } else if (field === "imageUrl") {
      newQuestions[index].imageUrl = value as string;
    }
    setQuestions(newQuestions);
  };

  // Handle media selection
  const handleMediaSelect = (media: MediaItem | MediaItem[]) => {
    const selectedMedia = Array.isArray(media) ? media[0] : media;
    const url = selectedMedia.cloudFrontUrl || selectedMedia.s3Url;

    if (mediaSelectorTarget === "thumbnail") {
      setFormData({ ...formData, thumbnailUrl: url });
    } else if (mediaSelectorTarget && typeof mediaSelectorTarget === "object" && mediaSelectorTarget.type === "quiz") {
      updateQuestion(mediaSelectorTarget.index, "imageUrl", url);
    }
    setMediaSelectorOpen(false);
    setMediaSelectorTarget(null);
  };

  const openMediaSelector = (target: "thumbnail" | { type: "quiz"; index: number }) => {
    setMediaSelectorTarget(target);
    setMediaSelectorOpen(true);
  };

  const updateQuestionOption = (qIndex: number, oIndex: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options[oIndex] = value;
    setQuestions(newQuestions);
  };

  const toggleCountry = (code: string) => {
    if (code === "ALL") {
      setFormData({ ...formData, countries: [] });
    } else {
      const newCountries = formData.countries.includes(code)
        ? formData.countries.filter((c) => c !== code)
        : [...formData.countries, code];
      setFormData({ ...formData, countries: newCountries });
    }
  };

  // Step 1: Type Selection
  if (!formData.type) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-white">Select Task Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {taskTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setFormData({ ...formData, type: type.id })}
                className={`p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-${type.color}-500/50 transition-all text-center group`}
              >
                <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-${type.color}-500/10 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${type.color}-400`} />
                </div>
                <h3 className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                  {type.label}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{type.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const selectedType = taskTypes.find((t) => t.id === formData.type);
  const TypeIcon = selectedType?.icon || Sparkles;

  return (
    <form onSubmit={(e) => handleSubmit(e)} className="space-y-8">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Task Type Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-${selectedType?.color}-500/10`}>
            <TypeIcon className={`w-5 h-5 text-${selectedType?.color}-400`} />
          </div>
          <div>
            <p className="text-sm text-gray-400">Task Type</p>
            <p className="text-white font-medium">{selectedType?.label}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormData({ ...formData, type: "" })}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Change Type
        </button>
      </div>

      {/* Assign to Task Board */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Assign to Task Board
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Optional — task becomes part of a board&apos;s reward bundle.
            </p>
          </div>
        </div>
        <select
          value={formData.boardId ?? ""}
          onChange={(e) =>
            setFormData({ ...formData, boardId: e.target.value })
          }
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">— Standalone task (default)</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        {formData.boardId && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
            ⚠ This task will <strong>not grant individual points or XP</strong>{" "}
            on completion. The reward is bundled into the Task Board and paid
            out when the user claims the entire board.
          </div>
        )}
      </div>

      {/* Basic Info */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Basic Information</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Watch Product Review Video"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what users need to do to complete this task..."
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>

          {(formData.type === "VIDEO" ||
            formData.type === "ARTICLE" ||
            formData.type === "SOCIAL") && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Thumbnail
              </label>
              <div className="space-y-3">
                {formData.thumbnailUrl ? (
                  <div className="relative inline-block">
                    <SmartImage
                      src={formData.thumbnailUrl}
                      alt="Thumbnail"
                      width={128}
                      height={80}
                      className="w-32 h-20 object-cover rounded-lg border border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, thumbnailUrl: "" })
                      }
                      className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-32 h-20 bg-gray-800 border border-gray-700 border-dashed rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-600" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openMediaSelector("thumbnail")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <ImageIcon className="w-4 h-4" />
                  {formData.thumbnailUrl ? "Change Thumbnail" : "Select Thumbnail"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Article Settings — links + keywords + proof builder */}
      {formData.type === "ARTICLE" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Article Task Settings
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Add one or many article links, optional keywords, and what proof
              the user must submit. Submissions go to PENDING; admin approves
              to credit points.
            </p>
          </div>
          <ArticleTaskBuilder
            value={articleConfig}
            onChange={setArticleConfig}
            taskId={effectiveTaskId ?? undefined}
            onSaveTask={saveTaskInPlace}
          />
        </div>
      )}

      {/* Video Settings — autoplay player config + watch time + warmup */}
      {formData.type === "VIDEO" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Video Task Settings
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Supports YouTube, Facebook, Vimeo, and direct video files. The
              user-side player is autoplay with controls disabled — they
              can&apos;t skip or pause.
            </p>
          </div>
          <VideoTaskBuilder value={videoConfig} onChange={setVideoConfig} />
        </div>
      )}

      {/* Social Settings — Platform-aware action builder with AI prompt support */}
      {formData.type === "SOCIAL" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Social Media Settings
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Choose the platform first — only that platform&apos;s actions
              will appear. Each action has its own required fields.
            </p>
          </div>
          <SocialTaskBuilder value={socialConfig} onChange={setSocialConfig} />
        </div>
      )}

      {/* Survey Settings — dynamic question builder */}
      {formData.type === "SURVEY" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Survey Settings</h2>
            <p className="text-sm text-gray-500 mt-1">
              Build a list of questions. Each user can submit answers once;
              every submission goes to PENDING for admin review. Question ids
              stay stable so renaming a prompt is safe for analytics.
            </p>
          </div>
          <SurveyTaskBuilder value={surveyConfig} onChange={setSurveyConfig} />
        </div>
      )}

      {/* Custom Task Settings — flexible "do anything" builder */}
      {formData.type === "CUSTOM" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Custom Task Form Builder
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Build any form you need. Add image-upload fields if you need
              photos, file-upload fields for documents, link fields for URLs,
              text/number fields for info — mix any types you want. Users will
              fill the form, and you review the answers in admin → submissions.
            </p>
          </div>
          <CustomTaskBuilder value={customConfig} onChange={setCustomConfig} />
        </div>
      )}

      {/* App-install builder */}
      {formData.type === "APPINSTALL" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-400" />
              App Install Task
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Paste a Play Store or App Store link and hit Fetch to auto-fill the
              app name, icon and description (all editable). The user installs the
              app, then uploads a proof screenshot.
            </p>
          </div>
          <AppInstallTaskBuilder
            value={appInstallConfig}
            onChange={setAppInstallConfig}
            onAutofill={(m) =>
              setFormData((f) => ({
                ...f,
                title: f.title || m.name,
                description: f.description || m.description,
                thumbnailUrl: f.thumbnailUrl || m.logo,
              }))
            }
          />
        </div>
      )}

      {/* Proxy Settings */}
      {formData.type === "PROXY" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white">Proxy Task Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Target URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                required
                value={formData.contentUrl}
                onChange={(e) => setFormData({ ...formData, contentUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Proxy Instructions
              </label>
              <textarea
                rows={3}
                value={formData.proxyInstructions}
                onChange={(e) => setFormData({ ...formData, proxyInstructions: e.target.value })}
                placeholder="Special instructions for proxy usage..."
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-3">
                Target Countries
              </label>
              <div className="flex flex-wrap gap-2">
                {countries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => toggleCountry(country.code)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      country.code === "ALL"
                        ? formData.countries.length === 0
                          ? "bg-indigo-500 border-indigo-500 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                        : formData.countries.includes(country.code)
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {country.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Questions */}
      {formData.type === "QUIZ" && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Quiz Questions</h2>
            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          </div>

          <div className="space-y-6">
            {questions.map((q, qIndex) => (
              <div key={qIndex} className="p-4 bg-gray-800 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-400">
                    Question {qIndex + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIndex)}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={q.question}
                  onChange={(e) => updateQuestion(qIndex, "question", e.target.value)}
                  placeholder="Enter question..."
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
                />

                {/* Question Image (Optional) */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    <ImageIcon className="w-4 h-4 inline mr-1" />
                    Question Image (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    {q.imageUrl ? (
                      <div className="relative">
                        <SmartImage
                          src={q.imageUrl}
                          alt={`Question ${qIndex + 1} image`}
                          width={96}
                          height={64}
                          className="w-24 h-16 object-cover rounded-lg border border-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuestion(qIndex, "imageUrl", "")}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-16 bg-gray-900 border border-gray-700 border-dashed rounded-lg flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openMediaSelector({ type: "quiz", index: qIndex })}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-900 text-gray-300 rounded-lg hover:bg-gray-700 border border-gray-700 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4" />
                      {q.imageUrl ? "Change" : "Add Image"}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Options (select correct answer)</p>
                  {q.options.map((option, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={q.correctAnswer === oIndex}
                        onChange={() => updateQuestion(qIndex, "correctAnswer", oIndex)}
                        className="w-4 h-4 text-indigo-500 bg-gray-900 border-gray-700"
                      />
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => updateQuestionOption(qIndex, oIndex, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                        className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Explanation (shown after answer)
                  </label>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(qIndex, "explanation", e.target.value)}
                    placeholder="Explain the correct answer..."
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rewards */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Rewards</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Points Reward <span className="text-red-400">*</span>
            </label>
            {formData.type === "SOCIAL" ? (
              <>
                <input
                  type="number"
                  readOnly
                  value={bundleTotalPoints(socialConfig.items)}
                  className="w-full px-4 py-2.5 bg-gray-800/60 border border-gray-700 rounded-lg text-gray-300 cursor-not-allowed focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Auto-calculated from the sum of each action&apos;s points.
                </p>
              </>
            ) : (
              <input
                type="number"
                required
                min="0"
                value={formData.pointsReward}
                onChange={(e) =>
                  setFormData({ ...formData, pointsReward: parseInt(e.target.value) || 0 })
                }
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              XP Reward
            </label>
            <input
              type="number"
              min="0"
              value={formData.xpReward}
              onChange={(e) =>
                setFormData({ ...formData, xpReward: parseInt(e.target.value) || 0 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Duration (seconds)
            </label>
            <input
              type="number"
              min="0"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              placeholder="Minimum time required"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Requirements</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Minimum Level
            </label>
            <input
              type="number"
              min="1"
              value={formData.minLevel}
              onChange={(e) =>
                setFormData({ ...formData, minLevel: parseInt(e.target.value) || 1 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Required Access Level
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={formData.requiredAccessLevel}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  requiredAccessLevel: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Only users on a plan with <code>accessLevel ≥ {formData.requiredAccessLevel}</code> can see / start this task. Default plan is usually 0.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Sequence Order
            </label>
            <input
              type="number"
              min={0}
              value={formData.order}
              onChange={(e) =>
                setFormData({ ...formData, order: parseInt(e.target.value) || 0 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Lower = earlier in the queue. Used when <strong>Sequential task unlock</strong> is on (Settings → Limits): tasks unlock one-by-one in this order.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Cooldown (minutes)
            </label>
            <input
              type="number"
              min="0"
              value={formData.cooldownMinutes}
              onChange={(e) =>
                setFormData({ ...formData, cooldownMinutes: parseInt(e.target.value) || 0 })
              }
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Visibility preview — surfaces the filter rules so admin notices unintended restrictions */}
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-indigo-200">
          <p className="font-bold uppercase tracking-wider text-indigo-300 mb-1">
            👁 Who will see this task
          </p>
          <p>
            Users at <strong>level {formData.minLevel}+</strong> on a plan with{" "}
            <strong>access level ≥ {formData.requiredAccessLevel}</strong>
            {formData.countries.length > 0
              ? <> from <strong>{formData.countries.join(", ")}</strong></>
              : <> from <strong>any country</strong></>}
            {formData.expiresAt
              ? <> until <strong>{new Date(formData.expiresAt).toLocaleDateString()}</strong>.</>
              : <>.</>}
            {" "}
            <span className="text-indigo-300/80">
              (Status must be ACTIVE — drafts/paused tasks stay hidden.)
            </span>
          </p>
        </div>
      </div>

      {/* Limits */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Limits</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Daily Limit per User
            </label>
            <input
              type="number"
              min="0"
              value={formData.dailyLimit}
              onChange={(e) => setFormData({ ...formData, dailyLimit: e.target.value })}
              placeholder="Blank = unlimited"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Total Slots
            </label>
            <input
              type="number"
              min="0"
              value={formData.totalLimit}
              onChange={(e) => setFormData({ ...formData, totalLimit: e.target.value })}
              placeholder="Blank = unlimited"
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-8">
            <input
              type="checkbox"
              id="autoApprove"
              checked={formData.autoApprove}
              onChange={(e) => setFormData({ ...formData, autoApprove: e.target.checked })}
              className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-indigo-500"
            />
            <label htmlFor="autoApprove" className="text-sm text-gray-400">
              Auto-approve submissions
            </label>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Instructions</h2>

        {/* Video Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Video className="w-4 h-4 inline mr-1" />
            Video Instructions (Optional)
          </label>
          <input
            type="url"
            value={formData.instructionVideoUrl}
            onChange={(e) => setFormData({ ...formData, instructionVideoUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
          />
          <p className="text-xs text-gray-500 mt-2">
            Enter a YouTube video URL to provide video instructions
          </p>
        </div>

        {/* Text Instructions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-400">
              <FileText className="w-4 h-4 inline mr-1" />
              Text Instructions (Optional)
            </label>
            <button
              type="button"
              onClick={addInstructionStep}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Step
            </button>
          </div>
          <div className="space-y-3">
            {instructionSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-8 h-8 shrink-0 flex items-center justify-center bg-gray-800 rounded-lg text-sm text-gray-400">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={step}
                  onChange={(e) => updateInstructionStep(index, e.target.value)}
                  placeholder={`Step ${index + 1} instructions...`}
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-red-500"
                />
                {instructionSteps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstructionStep(index)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scheduling */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
        <h2 className="text-lg font-semibold text-white">Scheduling</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Start Date & Time
            </label>
            <input
              type="datetime-local"
              value={formData.startsAt}
              onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              End Date & Time
            </label>
            <input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/tasks")}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
          Cancel
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Save as Draft
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isEditing ? "Update Task" : "Publish Task"}
          </button>
        </div>
      </div>

      {/* Media Selector Modal */}
      <MediaSelector
        isOpen={mediaSelectorOpen}
        onClose={() => {
          setMediaSelectorOpen(false);
          setMediaSelectorTarget(null);
        }}
        onSelect={handleMediaSelect}
        fileType="IMAGE"
        title={mediaSelectorTarget === "thumbnail" ? "Select Thumbnail" : "Select Question Image"}
      />
    </form>
  );
}
