/**
 * Where a point came from — one precise label per ledger row.
 *
 * `deriveSource()` (tx-sources.ts) groups rows for the wallet and the ledger,
 * and it is too coarse to answer "where are all these points coming from": it
 * filed every `EARNING` that was not social or check-in under "Tasks", so a
 * 5,000-point leaderboard prize read as task income, and every `daily_…`
 * reference — daily missions and daily referral commission included — read as
 * a check-in. Admin hand grants, most of them written with no reference at all,
 * disappeared into "Bonus".
 *
 * This classifier reads the reference prefix each writer actually uses (the
 * list was taken from the code AND from the live ledger, not from memory) and
 * is ordered so the longer prefixes win (`daily_mission_` before `daily_`,
 * `quiz_reward_` before `quiz_`). Client-safe: no prisma.
 */

export type PointSource =
  | "task"
  | "quiz_game"
  | "leaderboard"
  | "checkin"
  | "daily_mission"
  | "mission"
  | "board"
  | "event"
  | "achievement"
  | "welcome"
  | "browse"
  | "social"
  | "referral"
  | "referral_bonus"
  | "affiliate"
  | "lottery"
  | "offerwall"
  | "game"
  | "donation"
  | "admin_grant"
  | "other";

export const POINT_SOURCE_META: Record<PointSource, { label: string; hint: string; swatch: string }> = {
  task: { label: "Tasks", hint: "Approved task submissions — split by task type below", swatch: "bg-indigo-500" },
  quiz_game: { label: "Quiz games", hint: "Rewards from the /quizzes games", swatch: "bg-violet-500" },
  leaderboard: { label: "Leaderboard prizes", hint: "Daily / weekly / monthly prize payouts", swatch: "bg-amber-500" },
  checkin: { label: "Daily check-in", hint: "The daily check-in reward", swatch: "bg-teal-500" },
  daily_mission: { label: "Daily mission", hint: "Daily mission completion rewards", swatch: "bg-cyan-500" },
  mission: { label: "Missions", hint: "Mission and mission-tier rewards", swatch: "bg-sky-500" },
  board: { label: "Task boards", hint: "Task board completion claims", swatch: "bg-blue-500" },
  event: { label: "Events", hint: "Event / quest claims", swatch: "bg-fuchsia-500" },
  achievement: { label: "Achievements", hint: "Achievement and milestone rewards", swatch: "bg-purple-500" },
  welcome: { label: "Welcome bonus", hint: "Paid once to each new account", swatch: "bg-pink-500" },
  browse: { label: "Browse & Earn", hint: "Passive points for viewing ads", swatch: "bg-lime-500" },
  social: { label: "Social feed", hint: "Likes received, posts, comments, engagement ratio", swatch: "bg-rose-500" },
  referral: { label: "My Team commission", hint: "Commission on what referred users earn", swatch: "bg-emerald-500" },
  referral_bonus: { label: "Referral bonuses", hint: "Sign-up, purchase, subscription and milestone referral bonuses", swatch: "bg-green-500" },
  affiliate: { label: "Affiliate", hint: "Affiliate program commission", swatch: "bg-yellow-500" },
  lottery: { label: "Lottery", hint: "Lottery winnings", swatch: "bg-orange-500" },
  offerwall: { label: "Offerwalls", hint: "Offerwall completions (network postbacks)", swatch: "bg-red-500" },
  game: { label: "Games", hint: "Mini-games and mystery boxes", swatch: "bg-stone-400" },
  donation: { label: "Donations received", hint: "Points gifted by other users", swatch: "bg-slate-400" },
  admin_grant: { label: "Admin hand grants", hint: "Balance added by an admin by hand", swatch: "bg-red-600" },
  other: { label: "Other", hint: "A reference this classifier does not know yet", swatch: "bg-slate-600" },
};

/** A bare cuid — manual task approval writes the submission id with no prefix. */
const BARE_ID = /^c[a-z0-9]{20,}$/;

export function pointSourceOf(row: { type: string; reference?: string | null }): PointSource {
  const ref = (row.reference ?? "").toLowerCase();
  const has = (p: string) => ref.startsWith(p);

  switch (row.type) {
    case "REFERRAL":
      return "referral";
    case "AFFILIATE_COMMISSION":
      return "affiliate";
    case "LOTTERY_WIN":
      return "lottery";
    case "CHECKIN":
      return "checkin";
  }

  if (row.type === "BONUS" || row.type === "GIFT" || row.type === "PENALTY") {
    if (!ref || has("admin_edit_") || has("admin_adjust_")) return "admin_grant";
    if (has("welcome")) return "welcome";
    if (has("browse_")) return "browse";
    if (has("event_")) return "event";
    if (has("achievement_") || has("tasks_")) return "achievement";
    if (has("mission_")) return "mission";
    if (has("refbonus_")) return "referral_bonus";
    if (has("leaderboard_")) return "leaderboard";
    if (has("donation")) return "donation";
  }

  if (has("leaderboard_")) return "leaderboard";
  if (has("daily_mission_")) return "daily_mission";
  if (has("daily_referral_")) return "referral";
  if (has("daily_")) return "checkin";
  if (has("social_")) return "social";
  if (has("quiz_reward_")) return "quiz_game";
  if (has("quiz_")) return "task"; // a QUIZ task (api/tasks/quiz)
  if (has("board_claim_")) return "board";
  if (has("mission_")) return "mission";
  if (has("event_")) return "event";
  if (has("offerwall_")) return "offerwall";
  if (has("game_") || has("mystery_") || has("solo_")) return "game";
  if (has("donation_recv_")) return "donation";
  if (has("refbonus_")) return "referral_bonus";
  if (has("referral_")) return "referral";
  if (has("task_") || BARE_ID.test(ref)) return "task";
  return "other";
}

/**
 * The task submission a task-source row pays for, when the reference names one,
 * so the breakdown can split tasks by type. Writers use three shapes:
 * `task_<taskId>_<submissionId>` (auto-approval, social recheck),
 * `quiz_<submissionId>` (quiz tasks) and a bare `<submissionId>` (manual
 * approval).
 */
export function submissionIdOf(reference: string | null | undefined): string | null {
  const ref = reference ?? "";
  if (BARE_ID.test(ref)) return ref;
  const m = /^(?:task_c[a-z0-9]{20,}_|task_|quiz_)(c[a-z0-9]{20,})$/i.exec(ref);
  return m ? m[1] : null;
}
