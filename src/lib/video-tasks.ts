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
  /** Optional engagement steps (subscribe/like/comment). */
  engagement?: VideoEngagement;
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
  return { ok: true };
}
