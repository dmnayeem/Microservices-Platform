// Unified transaction "source" taxonomy — one place that maps a Prisma
// TransactionType (+ reference prefix) to a human source, and each source to a
// label / icon / color. Pure module (no prisma, no server-only) so both the API
// (deriveSource) and client wallet UI (SOURCE_META) can import it. Replaces the
// three fragmented, lossy maps that collapsed most types into "Other".

export type SourceKey =
  | "task"
  | "social"
  | "referral"
  | "affiliate"
  | "course"
  | "marketplace"
  | "deposit"
  | "withdraw"
  | "convert"
  | "bonus"
  | "lottery"
  | "checkin"
  | "adcredit"
  // Commission the platform takes when a buyer funds a task. Its own bucket
  // rather than folded into "admin": it is a revenue STREAM the owner needs to
  // read off the finance console, not an occasional administrative charge.
  | "taskfee"
  // Buying task credit, and spending it on a completion. Its own bucket
  // because "Purchase" told a buyer nothing about where their credit went.
  | "taskcredit"
  | "purchase"
  // Staff salary / commission. Its own bucket, never folded into "bonus":
  // payroll is the platform's own operating expense, and burying it in the
  // same line as user bonuses makes the profit figure unreadable.
  | "payroll"
  // CPA offers (src/lib/cpa) — EARNING rows under a `cpa_` reference.
  | "cpa"
  | "refund"
  | "admin"
  | "other";

/** Map a transaction (type + optional reference) to its user-facing source. */
export function deriveSource(type: string, reference?: string | null): SourceKey {
  const ref = (reference ?? "").toLowerCase();
  const isMarketplaceRef =
    ref.includes("marketplace") || ref.startsWith("order_") || ref.startsWith("deal_");
  switch (type) {
    case "DEPOSIT":
      return "deposit";
    case "WITHDRAWAL":
      return "withdraw";
    case "POINTS_CONVERSION":
      return "convert";
    case "REFERRAL":
      return "referral";
    case "AFFILIATE_COMMISSION":
      return "affiliate";
    case "COURSE_PURCHASE":
    case "COURSE_TUTOR_EARNING":
    case "COURSE_REFUND":
      return "course";
    case "LOTTERY_WIN":
      return "lottery";
    case "CHECKIN":
      return "checkin";
    case "AD_CREDIT_PURCHASE":
      return "adcredit";
    case "ADMIN_FEE":
      // Buyer task commission is written as ADMIN_FEE with a `task_fee_`
      // reference (see /api/tasks/create).
      return ref.startsWith("task_fee_") ? "taskfee" : "admin";
    case "PENALTY":
      return "admin";
    case "REFUND":
      return "refund";
    case "GIFT":
      return "bonus";
    case "BONUS":
      // Payroll is written as BONUS with a `payroll_` reference (see
      // src/lib/payroll/run.ts) — there is no SALARY transaction type, and
      // adding one is a schema change.
      return ref.startsWith("payroll_") ? "payroll" : "bonus";
    case "PURCHASE":
      if (ref.startsWith("taskcredit_") || ref.startsWith("taskspend_")) {
        return "taskcredit";
      }
      return isMarketplaceRef ? "marketplace" : "purchase";
    case "EARNING":
      if (ref.startsWith("social_")) return "social";
      if (ref.startsWith("cpa_")) return "cpa";
      // A leaderboard prize is a bonus, not task income — it was tagged "Tasks".
      if (ref.startsWith("leaderboard_")) return "bonus";
      if (ref.startsWith("daily_")) return "checkin";
      if (isMarketplaceRef) return "marketplace";
      return "task";
    default:
      return "other";
  }
}

export interface SourceMeta {
  label: string;
  /** lucide-react icon name — resolved to a component on the client. */
  icon: string;
  /** chip classes: tinted bg + text. */
  tone: string;
  /** solid swatch bg for breakdown legends/bars. */
  swatch: string;
  /** True when this source is normally money leaving the wallet. */
  outflow?: boolean;
}

/** Distinct color + icon + label per source (the "ek ek platform er color" ask). */
export const SOURCE_META: Record<SourceKey, SourceMeta> = {
  task: { label: "Tasks", icon: "ListChecks", tone: "bg-indigo-500/10 text-indigo-400", swatch: "bg-indigo-500" },
  social: { label: "Social", icon: "MessageSquare", tone: "bg-rose-500/10 text-rose-400", swatch: "bg-rose-500" },
  referral: { label: "Referrals", icon: "Users", tone: "bg-purple-500/10 text-purple-400", swatch: "bg-purple-500" },
  affiliate: { label: "Affiliate", icon: "Handshake", tone: "bg-fuchsia-500/10 text-fuchsia-400", swatch: "bg-fuchsia-500" },
  course: { label: "Courses", icon: "GraduationCap", tone: "bg-sky-500/10 text-sky-400", swatch: "bg-sky-500" },
  marketplace: { label: "Marketplace", icon: "ShoppingBag", tone: "bg-orange-500/10 text-orange-400", swatch: "bg-orange-500" },
  deposit: { label: "Add Funds", icon: "ArrowDownToLine", tone: "bg-emerald-500/10 text-emerald-400", swatch: "bg-emerald-500" },
  withdraw: { label: "Withdrawal", icon: "ArrowUpRight", tone: "bg-red-500/10 text-red-400", swatch: "bg-red-500", outflow: true },
  convert: { label: "Convert", icon: "Repeat", tone: "bg-cyan-500/10 text-cyan-400", swatch: "bg-cyan-500" },
  bonus: { label: "Bonus", icon: "Sparkles", tone: "bg-pink-500/10 text-pink-400", swatch: "bg-pink-500" },
  lottery: { label: "Lottery", icon: "Trophy", tone: "bg-amber-500/10 text-amber-400", swatch: "bg-amber-500" },
  checkin: { label: "Check-in", icon: "CalendarCheck", tone: "bg-teal-500/10 text-teal-400", swatch: "bg-teal-500" },
  adcredit: { label: "Ad Credit", icon: "Megaphone", tone: "bg-violet-500/10 text-violet-400", swatch: "bg-violet-500", outflow: true },
  taskfee: { label: "Task fees", icon: "Receipt", tone: "bg-teal-500/10 text-teal-400", swatch: "bg-teal-500" },
  taskcredit: { label: "Task Credit", icon: "Sparkles", tone: "bg-violet-500/10 text-violet-400", swatch: "bg-violet-500" },
  payroll: { label: "Payroll", icon: "BadgeDollarSign", tone: "bg-rose-500/10 text-rose-400", swatch: "bg-rose-500", outflow: true },
  purchase: { label: "Purchase", icon: "ShoppingCart", tone: "bg-amber-500/10 text-amber-400", swatch: "bg-amber-500", outflow: true },
  cpa: { label: "CPA offers", icon: "Target", tone: "bg-lime-500/10 text-lime-400", swatch: "bg-lime-500" },
  refund: { label: "Refund", icon: "Undo2", tone: "bg-green-500/10 text-green-400", swatch: "bg-green-500" },
  admin: { label: "Adjustment", icon: "Shield", tone: "bg-slate-500/10 text-slate-400", swatch: "bg-slate-500" },
  other: { label: "Other", icon: "Coins", tone: "bg-gray-500/10 text-gray-400", swatch: "bg-gray-500" },
};

/** All source keys in a sensible display order (for filter chips / legends). */
export const SOURCE_ORDER: SourceKey[] = [
  "task", "social", "cpa", "referral", "affiliate", "course", "marketplace",
  "deposit", "convert", "withdraw", "bonus", "lottery", "checkin",
  "adcredit", "taskcredit", "taskfee", "payroll", "purchase", "refund", "admin", "other",
];
