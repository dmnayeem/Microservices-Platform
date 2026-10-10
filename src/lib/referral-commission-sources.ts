/**
 * Which earning sources pay My Team (multi-level referral) commission.
 *
 * Client-safe (no prisma): the admin screen renders the list from here and
 * `processReferralCommissions` enforces it from here, so the label an admin
 * ticks and the key the payout reads cannot drift apart.
 *
 * Setting `referral.commission_sources` — a map of source key → boolean. A key
 * that is missing reads as its default, and the defaults are EXACTLY what the
 * platform did before the setting existed (2026-09-29):
 *
 *   paid commission → every approved task submission, whatever its type (the
 *                     admin review, the auto-approve on submit, the quiz-task
 *                     player and the social re-check all call it)
 *   did not         → CPA offers, offerwall completions, and everything listed
 *                     in NOT_CONNECTED_SOURCES
 *
 * So nothing changes until an admin edits the list.
 */

export const REFERRAL_COMMISSION_SOURCES_KEY = "referral.commission_sources";

export const TASK_COMMISSION_TYPES = [
  { type: "VIDEO", label: "Video tasks" },
  { type: "ARTICLE", label: "Article tasks" },
  { type: "QUIZ", label: "Quiz tasks" },
  { type: "SURVEY", label: "Survey tasks" },
  { type: "SOCIAL", label: "Social tasks" },
  { type: "PROXY", label: "Proxy tasks" },
  { type: "OFFERWALL", label: "Offerwall-type tasks" },
  { type: "CUSTOM", label: "Custom tasks" },
  { type: "APPINSTALL", label: "App install tasks" },
  { type: "VISIT", label: "Visit tasks (links & shorteners)" },
] as const;

export type TaskCommissionType = (typeof TASK_COMMISSION_TYPES)[number]["type"];
export type CommissionSourceKey = `task.${TaskCommissionType}` | "cpa" | "offerwall";

export interface CommissionSourceItem {
  key: CommissionSourceKey;
  label: string;
  hint?: string;
}

export const COMMISSION_SOURCE_GROUPS: readonly {
  id: string;
  label: string;
  items: readonly CommissionSourceItem[];
}[] = [
  {
    id: "tasks",
    label: "Tasks by type",
    items: TASK_COMMISSION_TYPES.map((t) => ({
      key: `task.${t.type}` as CommissionSourceKey,
      label: t.label,
    })),
  },
  {
    id: "offers",
    label: "Offers",
    items: [
      {
        key: "cpa",
        label: "CPA offers",
        hint: "Paid when a conversion is credited (after any hold). Not taken back if the network later reverses it.",
      },
      {
        key: "offerwall",
        label: "Offerwall completions",
        hint: "Paid when a completion is credited (after any hold).",
      },
    ],
  },
];

/**
 * Earning sources that do NOT pay My Team commission and have no switch —
 * listed so the admin sees the whole picture. Nothing in their code calls the
 * commission payout, so a switch here would look live and do nothing.
 */
export const NOT_CONNECTED_SOURCES: readonly { label: string; note: string }[] = [
  { label: "Task boards (board claims)", note: "a board's tasks pay nothing on their own; the claim does not pay commission" },
  { label: "Quiz games", note: "the /quizzes games" },
  { label: "Games & mystery boxes", note: "" },
  { label: "Browse & Earn / rewarded ads", note: "" },
  { label: "Social earning (ratio reward)", note: "" },
  { label: "Daily check-in, missions, events, achievements, milestones, leaderboard prizes", note: "" },
  { label: "Courses and marketplace sales", note: "these pay affiliate commission instead" },
];

export const DEFAULT_COMMISSION_SOURCES: Readonly<Record<CommissionSourceKey, boolean>> = {
  ...(Object.fromEntries(TASK_COMMISSION_TYPES.map((t) => [`task.${t.type}`, true])) as Record<
    `task.${TaskCommissionType}`,
    boolean
  >),
  cpa: false,
  offerwall: false,
};

export const COMMISSION_SOURCE_KEYS = Object.keys(DEFAULT_COMMISSION_SOURCES) as CommissionSourceKey[];

/** The stored map, with every known key present (missing → default; junk ignored). */
export function normalizeCommissionSources(v: unknown): Record<CommissionSourceKey, boolean> {
  const raw =
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_COMMISSION_SOURCES } as Record<CommissionSourceKey, boolean>;
  for (const k of COMMISSION_SOURCE_KEYS) {
    if (typeof raw[k] === "boolean") out[k] = raw[k] as boolean;
  }
  return out;
}

/** The switch for one task type. An unknown type follows today's rule: it pays. */
export function taskTypeCommissionOn(
  sources: Record<CommissionSourceKey, boolean>,
  type: string | null | undefined
): boolean {
  const k = `task.${type ?? ""}` as CommissionSourceKey;
  return k in sources ? sources[k] : true;
}

/** True when every task type pays — the default, which needs no task lookup. */
export function allTaskTypesOn(sources: Record<CommissionSourceKey, boolean>): boolean {
  return TASK_COMMISSION_TYPES.every((t) => sources[`task.${t.type}`]);
}
