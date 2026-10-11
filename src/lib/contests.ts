/**
 * Creator contests — shared, client-safe parts (server logic in
 * ./contests-server.ts).
 *
 * A contest is judged on merit: an admin score (0–10) and members' votes,
 * mixed by `voteWeightPct`. Entry is free; prizes are points. No stake, no
 * draw — this is a skill contest, not a game of chance.
 */

export const CONTEST_PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "FACEBOOK", "ANY"] as const;
export type ContestPlatform = (typeof CONTEST_PLATFORMS)[number];

export const CONTEST_PLATFORM_LABEL: Record<ContestPlatform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram Reels",
  YOUTUBE: "YouTube Shorts",
  FACEBOOK: "Facebook",
  ANY: "Any platform",
};

const HOSTS: Record<Exclude<ContestPlatform, "ANY">, string[]> = {
  TIKTOK: ["tiktok.com", "vm.tiktok.com"],
  INSTAGRAM: ["instagram.com"],
  YOUTUBE: ["youtube.com", "youtu.be"],
  FACEBOOK: ["facebook.com", "fb.watch", "fb.com"],
};

/** Which platform a link belongs to, or null for an unknown site. */
export function platformOfUrl(url: string): Exclude<ContestPlatform, "ANY"> | null {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase().replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
  for (const [p, hosts] of Object.entries(HOSTS)) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p as Exclude<ContestPlatform, "ANY">;
  }
  return null;
}

export type ContestPhase = "draft" | "upcoming" | "open" | "voting" | "judging" | "finished" | "cancelled";

/** Where a contest is now, from its status and dates. */
export function contestPhase(
  c: { status: string; startAt: Date | string; endAt: Date | string; votingEndsAt: Date | string },
  now: number
): ContestPhase {
  if (c.status === "DRAFT") return "draft";
  if (c.status === "CANCELLED") return "cancelled";
  if (c.status === "FINISHED") return "finished";
  const t = (d: Date | string) => new Date(d).getTime();
  if (now < t(c.startAt)) return "upcoming";
  if (now < t(c.endAt)) return "open";
  if (now < t(c.votingEndsAt)) return "voting";
  return "judging";
}

export const CONTEST_PHASE_LABEL: Record<ContestPhase, string> = {
  draft: "Draft",
  upcoming: "Starting soon",
  open: "Open for entries",
  voting: "Voting",
  judging: "Picking winners",
  finished: "Finished",
  cancelled: "Cancelled",
};

export interface ContestPrize {
  rank: number;
  points: number;
}

export interface ContestInput {
  title: string;
  description: string;
  rules: string | null;
  coverImage: string | null;
  platforms: ContestPlatform[];
  hashtag: string | null;
  startAt: Date;
  endAt: Date;
  votingEndsAt: Date;
  voteWeightPct: number;
  minLevelToEnter: number;
  minLevelToVote: number;
  maxEntriesPerUser: number;
  prizes: ContestPrize[];
  participationPoints: number;
}

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Admin form → clean input, or an error message (never clamped silently for dates/prizes). */
export function parseContestInput(raw: unknown): { ok: true; value: ContestInput } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = String(r.title ?? "").trim().slice(0, 120);
  const description = String(r.description ?? "").trim().slice(0, 5000);
  if (title.length < 3) return { ok: false, error: "Give the contest a title." };
  if (description.length < 10) return { ok: false, error: "Describe what people should make." };
  const d = (v: unknown) => {
    const x = new Date(String(v ?? ""));
    return Number.isNaN(x.getTime()) ? null : x;
  };
  const startAt = d(r.startAt);
  const endAt = d(r.endAt);
  const votingEndsAt = d(r.votingEndsAt);
  if (!startAt || !endAt || !votingEndsAt) return { ok: false, error: "Set the start, entry-close and voting-end dates." };
  if (!(startAt < endAt)) return { ok: false, error: "Entries must close after they open." };
  if (!(endAt <= votingEndsAt)) return { ok: false, error: "Voting must end on or after entries close." };
  const platforms = (Array.isArray(r.platforms) ? r.platforms : [])
    .map((p) => String(p).toUpperCase())
    .filter((p): p is ContestPlatform => (CONTEST_PLATFORMS as readonly string[]).includes(p));
  const prizes: ContestPrize[] = [];
  for (const p of Array.isArray(r.prizes) ? r.prizes : []) {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const points = Math.round(Number(o.points));
    if (!Number.isFinite(points) || points <= 0) continue;
    if (points > 1_000_000) return { ok: false, error: "A prize can be at most 1,000,000 points." };
    prizes.push({ rank: prizes.length + 1, points });
  }
  if (prizes.length === 0) return { ok: false, error: "Add at least one prize (1st place)." };
  let hashtag = String(r.hashtag ?? "").trim().replace(/\s+/g, "");
  if (hashtag && !hashtag.startsWith("#")) hashtag = `#${hashtag}`;
  return {
    ok: true,
    value: {
      title,
      description,
      rules: String(r.rules ?? "").trim().slice(0, 5000) || null,
      coverImage: String(r.coverImage ?? "").trim() || null,
      platforms: platforms.length ? [...new Set(platforms)] : ["ANY"],
      hashtag: hashtag.slice(0, 60) || null,
      startAt,
      endAt,
      votingEndsAt,
      voteWeightPct: int(r.voteWeightPct, 50, 0, 100),
      minLevelToEnter: int(r.minLevelToEnter, 0, 0, 200),
      minLevelToVote: int(r.minLevelToVote, 3, 0, 200),
      maxEntriesPerUser: int(r.maxEntriesPerUser, 1, 1, 10),
      prizes,
      participationPoints: int(r.participationPoints, 0, 0, 100_000),
    },
  };
}

/**
 * Final score, 0–100: the admin's score (0–10 → 0–100) and the entry's share
 * of the most-voted entry's votes, mixed by voteWeightPct.
 */
export function contestScore(adminScore: number | null, votes: number, maxVotes: number, voteWeightPct: number): number {
  const w = Math.min(100, Math.max(0, voteWeightPct)) / 100;
  const admin = Math.min(10, Math.max(0, adminScore ?? 0)) * 10;
  const vote = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;
  return Math.round((admin * (1 - w) + vote * w) * 10) / 10;
}
