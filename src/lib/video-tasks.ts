/**
 * Video Task Configuration
 * ------------------------
 * Video tasks play a video (YouTube, Facebook, Vimeo, or direct mp4) for a
 * configurable watch duration. Player is autoplay with controls disabled —
 * touches are absorbed by an overlay so the user can't pause/seek/skip.
 *
 * Flow:
 *   warmup countdown → watch countdown → submit (auto or manual)
 *
 * On submit (with auto-approve), points are credited immediately.
 * Optional uniqueKey verifies the user actually watched.
 */

export type VideoProvider =
  | "YOUTUBE"
  | "FACEBOOK"
  | "VIMEO"
  | "DIRECT"
  | "OTHER";

/**
 * Optional YouTube-style engagement layer bundled with a VIDEO task (#11), so a
 * single task can be "watch + subscribe + like + comment" instead of a separate
 * SOCIAL task. YouTube can't be API-verified, so proof is either honor-based
 * (checkboxes → auto-approve, guarded by the trust-score/spot-check anti-fraud)
 * OR a required screenshot (→ manual review) — the admin picks via the existing
 * `proofRequirements.screenshot` flag.
 */
export interface VideoEngagement {
  /** "Open channel" target for the Subscribe step. */
  channelUrl?: string;
  requireSubscribe: boolean;
  requireLike: boolean;
  requireComment: boolean;
  /** Suggested comment text the user can copy (Comment step). */
  commentTemplate?: string;
}

/** Typed action for a sequential proof step. Drives the icon/verb/labels and,
 *  for `comment`, the copyable template. `custom` is a free-form step. */
export type VideoStepType = "link" | "like" | "comment" | "subscribe" | "custom";

/**
 * One sequential proof step shown after the video ends. Steps unlock in order:
 * the user opens the action link, does the action, uploads a screenshot and/or
 * pastes a proof link (if required), presses Save → the step completes and the
 * next unlocks. Optional steps can be skipped. When all REQUIRED steps are done
 * a Complete button appears (→ interstitial ad → submit). Used instead of the
 * legacy flat engagement checklist when `steps` is set on the config.
 */
export interface VideoStep {
  id: string;
  /** Action type — drives the UI. Undefined on legacy steps ⇒ treat as "custom". */
  type?: VideoStepType;
  /** Instruction shown to the user, e.g. "Subscribe to the channel". */
  label: string;
  /** External link the user opens to perform the action. */
  actionUrl?: string;
  /** Require a screenshot upload to complete this step. */
  requireScreenshot: boolean;
  /** Require the user to paste a link (e.g. their comment/profile URL) as proof. */
  requireLink?: boolean;
  /** Whether this step must be completed. Undefined ⇒ required (back-compat). */
  required?: boolean;
  /** Copyable suggested text for `comment` steps. */
  commentTemplate?: string;
}

/** A step is required unless explicitly marked optional. */
export function stepIsRequired(s: VideoStep): boolean {
  return s.required !== false;
}

/** Normalise a (possibly legacy) step's type. */
export function stepType(s: VideoStep): VideoStepType {
  return s.type ?? "custom";
}

export const STEP_TYPE_META: Record<
  VideoStepType,
  { label: string; verb: string; emoji: string; openText: string; urlLabel: string }
> = {
  link: { label: "Visit link", verb: "Visit the link", emoji: "🔗", openText: "Open link", urlLabel: "Link to visit" },
  like: { label: "Like", verb: "Like the video", emoji: "👍", openText: "Open video", urlLabel: "Video URL" },
  comment: { label: "Comment", verb: "Comment on the video", emoji: "💬", openText: "Open video", urlLabel: "Video URL" },
  subscribe: { label: "Subscribe", verb: "Subscribe to the channel", emoji: "🔔", openText: "Open channel", urlLabel: "Channel URL" },
  custom: { label: "Custom", verb: "Complete the action", emoji: "✅", openText: "Open link", urlLabel: "Action link (optional)" },
};

/** Default instruction text for a freshly-added step of the given type. */
export function defaultStepLabel(type: VideoStepType): string {
  return STEP_TYPE_META[type].verb;
}

/** Per-step proof the runner collects and submits (stored on the submission). */
export interface VideoStepProof {
  id: string;
  type: VideoStepType;
  /** Screenshot URL (task-proofs/…) when the step required one. */
  screenshotUrl?: string;
  /** Pasted proof link when the step required one. */
  link?: string;
  status: "done" | "skipped";
}

export interface VideoConfig {
  videoUrl: string;
  provider: VideoProvider;
  /** Total watch time in seconds the user must complete */
  watchSeconds: number;
  /** Delay before the watch timer starts (anti-bot) */
  warmupSeconds: number;
  /** When true, submit fires automatically when watchSeconds elapses */
  autoSubmit: boolean;
  proofRequirements: {
    screenshot: boolean;
    uniqueKey: boolean;
  };
  uniqueKey?: string;
  uniqueKeyHint?: string;
  /** Optional engagement steps (subscribe/like/comment) — legacy flat checklist. */
  engagement?: VideoEngagement;
  /** Ordered sequential proof steps (new flow). When non-empty, the player
   *  shows steps one at a time with per-step screenshot upload + Save. */
  steps?: VideoStep[];
  /** For step-based video tasks: auto-approve on submit (→ instant points) vs
   *  hold for admin review (→ Pending, points on approval). Default false. */
  autoApprove?: boolean;
}

/**
 * Convert the legacy flat engagement checklist into proof-capable typed steps.
 * Lets old "require subscribe/like/comment" tasks use the single typed-step flow
 * (with a screenshot upload) instead of the honor-based "I did this" checkbox.
 * Screenshot is required by default so the user gets a proof place; admins can
 * edit the task to adjust per-step proof.
 */
export function synthesizeStepsFromEngagement(
  cfg: VideoConfig | null | undefined
): VideoStep[] {
  const e = cfg?.engagement;
  if (!e) return [];
  const mk = (
    type: VideoStepType,
    actionUrl: string,
    extra: Partial<VideoStep> = {}
  ): VideoStep => ({
    id: `eng-${type}`,
    type,
    label: STEP_TYPE_META[type].verb,
    actionUrl,
    requireScreenshot: true,
    requireLink: false,
    required: true,
    ...extra,
  });
  const url = cfg?.videoUrl ?? "";
  const out: VideoStep[] = [];
  if (e.requireSubscribe) out.push(mk("subscribe", e.channelUrl || url));
  if (e.requireLike) out.push(mk("like", url));
  if (e.requireComment)
    out.push(mk("comment", url, { commentTemplate: e.commentTemplate }));
  return out;
}

/**
 * Ordered sequential proof steps for a task. Uses the configured `steps` when
 * present; otherwise falls back to steps synthesized from the legacy engagement
 * checklist — so both old and new tasks flow through the single typed-step UI.
 */
export function effectiveSteps(
  cfg: VideoConfig | null | undefined
): VideoStep[] {
  return cfg?.steps?.length ? cfg.steps : synthesizeStepsFromEngagement(cfg);
}

export type EngagementKey = "subscribe" | "like" | "comment";
export interface EngagementStep {
  key: EngagementKey;
  label: string;
  /** External link the user opens to perform the action. */
  url: string;
}

/** True if the task requires any engagement action beyond watching. */
export function hasEngagement(cfg: VideoConfig | null | undefined): boolean {
  const e = cfg?.engagement;
  return !!e && (e.requireSubscribe || e.requireLike || e.requireComment);
}

/** Ordered engagement steps for a task (subscribe → like → comment). */
export function engagementSteps(
  cfg: VideoConfig | null | undefined
): EngagementStep[] {
  const e = cfg?.engagement;
  if (!e) return [];
  const steps: EngagementStep[] = [];
  if (e.requireSubscribe)
    steps.push({
      key: "subscribe",
      label: "Subscribe to the channel",
      url: e.channelUrl || cfg!.videoUrl,
    });
  if (e.requireLike)
    steps.push({ key: "like", label: "Like the video", url: cfg!.videoUrl });
  if (e.requireComment)
    steps.push({
      key: "comment",
      label: "Comment on the video",
      url: cfg!.videoUrl,
    });
  return steps;
}

export function emptyVideoConfig(): VideoConfig {
  return {
    videoUrl: "",
    provider: "OTHER",
    watchSeconds: 30,
    warmupSeconds: 3,
    autoSubmit: true,
    proofRequirements: {
      screenshot: false,
      uniqueKey: false,
    },
    uniqueKey: "",
    uniqueKeyHint: "",
  };
}

/** Auto-detect the provider from a URL */
export function detectProvider(url: string): VideoProvider {
  if (!url) return "OTHER";
  const u = url.toLowerCase();
  if (
    u.includes("youtube.com") ||
    u.includes("youtu.be") ||
    u.includes("youtube-nocookie.com")
  )
    return "YOUTUBE";
  if (
    u.includes("facebook.com/watch") ||
    u.includes("fb.watch") ||
    u.includes("facebook.com") &&
      (u.includes("/videos/") || u.includes("/video.php"))
  )
    return "FACEBOOK";
  if (u.includes("vimeo.com")) return "VIMEO";
  if (u.match(/\.(mp4|webm|ogg|mov|m3u8)(\?|$)/)) return "DIRECT";
  return "OTHER";
}

const PROVIDER_META: Record<
  VideoProvider,
  { label: string; emoji: string; tone: string }
> = {
  YOUTUBE: {
    label: "YouTube",
    emoji: "▶️",
    tone: "bg-[#ff0000]/15 text-red-400 border-red-500/30",
  },
  FACEBOOK: {
    label: "Facebook",
    emoji: "📘",
    tone: "bg-[#1877f2]/15 text-blue-400 border-blue-500/30",
  },
  VIMEO: {
    label: "Vimeo",
    emoji: "🔷",
    tone: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  },
  DIRECT: {
    label: "Direct video",
    emoji: "🎞️",
    tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  OTHER: {
    label: "Other",
    emoji: "❓",
    tone: "bg-gray-700 text-gray-400 border-gray-700",
  },
};

export function getProviderMeta(p: VideoProvider) {
  return PROVIDER_META[p];
}

export function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function validateVideoConfig(
  cfg: VideoConfig
): { ok: boolean; error?: string } {
  if (!cfg.videoUrl.trim()) {
    return { ok: false, error: "Video URL is required" };
  }
  try {
    new URL(cfg.videoUrl);
  } catch {
    return { ok: false, error: "Invalid video URL" };
  }
  if (cfg.watchSeconds < 1) {
    return { ok: false, error: "Watch time must be at least 1 second" };
  }
  if (cfg.warmupSeconds < 0) {
    return { ok: false, error: "Warmup time can't be negative" };
  }
  if (cfg.proofRequirements.uniqueKey && !cfg.uniqueKey?.trim()) {
    return {
      ok: false,
      error: "Unique key is required when 'Unique Key' proof is enabled",
    };
  }
  if (cfg.engagement?.requireSubscribe && !cfg.engagement.channelUrl?.trim()) {
    return {
      ok: false,
      error: "Channel URL is required when 'Require Subscribe' is enabled",
    };
  }
  for (const [i, s] of (cfg.steps ?? []).entries()) {
    if (!s.label.trim()) {
      return { ok: false, error: `Step ${i + 1}: an instruction is required` };
    }
    // Typed engagement steps need a link to open; only `custom` may omit it.
    const t = stepType(s);
    if (t !== "custom" && !s.actionUrl?.trim()) {
      return {
        ok: false,
        error: `Step ${i + 1} (${STEP_TYPE_META[t].label}): a ${STEP_TYPE_META[t].urlLabel} is required`,
      };
    }
    if (!s.requireScreenshot && !s.requireLink && stepIsRequired(s)) {
      return {
        ok: false,
        error: `Step ${i + 1}: a required step needs at least a screenshot or a link as proof`,
      };
    }
  }
  return { ok: true };
}
