"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Wallet,
  Plus,
  Users,
  Receipt,
  ListChecks,
  Sparkles,
  AlertCircle,
  Clock,
  Pause,
  Play,
  Loader2,
  ShieldCheck,
  Eye,
  ExternalLink,
  Pencil,
  Trash2,
  Target,
  Flag,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { usd, pts, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { TASK_CREDIT } from "@/lib/task-credit-theme";
import {
  MAX_REPORT_REASON,
  MIN_REPORT_REASON,
  REPORT_WINDOW_DAYS,
} from "@/lib/buyer-reports";
import { Modal } from "@/components/user/profile/profile-ui";
import type { BuyerPlatform } from "@/components/user/tasks/create-task-view";
import {
  TaskAudienceTargeting,
  type TaskAudienceValue,
} from "@/components/admin/tasks/task-audience-targeting";

export interface BuyerTaskRow {
  id: string;
  title: string;
  type: string;
  status: string;
  pointsReward: number;
  targetCount: number;
  budgetPoints: number;
  remainingBudget: number;
  approvedCount: number;
  pendingCount: number;
  rejectionReason: string | null;
  createdAt: string;
  // Everything the edit form needs. Optional because nothing outside this
  // file constructs a BuyerTaskRow without them, but a future caller that
  // only needs the list view (no editing) shouldn't be forced to fetch them.
  description?: string;
  instructions?: string | null;
  socialUrl?: string | null;
  socialPlatform?: string | null;
  socialAction?: string | null;
  minLevel?: number;
  countries?: string[];
  genders?: string[];
  regions?: string[];
  divisions?: string[];
  districts?: string[];
  subDistricts?: string[];
  postalCodes?: string[];
  minAge?: number | null;
  maxAge?: number | null;
}

/** Statuses the buyer may still edit. Mirrors `EDITABLE` in the PATCH route —
 *  offering Edit on a finished task would show a control the server refuses. */
const EDITABLE_STATUSES = new Set(["PENDING_REVIEW", "ACTIVE", "PAUSED"]);

interface ProofRow {
  id: string;
  status: string;
  proof: string | null;
  proofImages: string[];
  pointsPaid: number;
  at: string;
  /** Set once this buyer has flagged it; null while it can still be flagged. */
  report: { status: string; reason: string; at: string } | null;
  /** False when already reported, or older than the reporting window. */
  reportable: boolean;
}

/**
 * How a task is actually performing — the answer to "what did my money buy?".
 *
 * Every figure here is measured, not projected: the cost numbers are summed off
 * the same ledger rows the invoice tab lists, so a buyer comparing the two
 * cannot be shown two different stories about what they were charged.
 */
interface TaskStats {
  approved: number;
  pending: number;
  rejected: number;
  target: number;
  acceptRate: number | null;
  fillRate: number | null;
  rewardPaid: number;
  feePaid: number;
  totalPaid: number;
  costPerCompletion: number | null;
  hoursToFirst: number | null;
  perDay: number;
  daysLeft: number | null;
  countries: { country: string; count: number }[];
  reportsUsed: number;
  reportsAllowed: number;
}

export interface InvoiceRow {
  id: string;
  reference: string;
  description: string;
  /** Negative = charged to the buyer, positive = refunded to them. */
  amountUsd: number;
  /** Credit moved. Negative = spent, positive = bought. */
  points: number;
  createdAt: string;
}

/**
 * Status wording written for the buyer, not for the database.
 *
 * `PENDING_REVIEW` tells them nothing about what is happening or what they
 * should do; "Waiting for approval" does. Colour carries the same meaning for
 * anyone scanning the list rather than reading it.
 */
/**
 * Completions of runway below which a buyer is warned.
 *
 * Not zero: at zero the tasks have already stopped and the damage is done.
 * Five is roughly "you have a day or two on a task that is moving", which is
 * enough time to act without nagging anyone who is comfortably funded.
 */
const LOW_RUNWAY = 5;

const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_REVIEW: {
    label: "Waiting for approval",
    tone: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  },
  ACTIVE: {
    label: "Live",
    tone: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
  },
  PAUSED: {
    label: "Paused",
    tone: "bg-(--app-ink-3)/10 text-(--app-ink-2) ring-(--app-ink-3)/20",
  },
  REJECTED: {
    label: "Rejected",
    tone: "bg-red-500/10 text-red-300 ring-red-500/20",
  },
  COMPLETED: {
    label: "Finished",
    tone: "bg-(--app-cta)/10 text-(--app-accent-ink) ring-(--app-accent-edge)/20",
  },
  EXPIRED: {
    label: "Expired",
    tone: "bg-(--app-ink-3)/10 text-(--app-ink-3) ring-(--app-ink-3)/20",
  },
  ARCHIVED: {
    label: "Archived",
    tone: "bg-(--app-ink-3)/10 text-(--app-ink-3) ring-(--app-ink-3)/20",
  },
  DRAFT: {
    label: "Draft",
    tone: "bg-(--app-ink-3)/10 text-(--app-ink-3) ring-(--app-ink-3)/20",
  },
};

export function BuyerHubView({
  cashBalance,
  taskCredit,
  runway,
  burnPerDay,
  daysOfCredit,
  pointsPerUsd,
  feePercent,
  canCreate,
  tasks,
  invoices,
  platforms = [],
  canTarget = false,
  minPoints = 1,
  maxPoints = 100000,
  maxCompletions = 100000,
}: {
  cashBalance: number;
  taskCredit: number;
  /**
   * How many more completions the credit covers across live tasks, or null
   * when nothing is live. Null and 0 mean different things and must not be
   * collapsed: "nothing running" is fine, "0 left" is urgent.
   */
  runway: number | null;
  /** Credit actually spent per day over the last 7 days, measured off the ledger. */
  burnPerDay: number;
  /**
   * Days of credit left at that rate, or null when nothing has been spent
   * recently. "About 4 days" is the half of the runway question that tells a
   * buyer whether to top up before the weekend; the completions figure alone
   * does not.
   */
  daysOfCredit: number | null;
  pointsPerUsd: number;
  feePercent: number;
  canCreate: boolean;
  tasks: BuyerTaskRow[];
  invoices: InvoiceRow[];
  /** Platforms this buyer may target — same scoped catalog the create form uses. */
  platforms?: BuyerPlatform[];
  /** Admin-granted `targetTasks` — gates the audience section, same as create. */
  canTarget?: boolean;
  minPoints?: number;
  maxPoints?: number;
  maxCompletions?: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"tasks" | "invoices">("tasks");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofRow[] | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  /** The submission a report is being written about, and the text so far. */
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [reporting, setReporting] = useState(false);
  const [editingTask, setEditingTask] = useState<BuyerTaskRow | null>(null);

  /** Retire a task for good. Nothing to refund — see the API note. */
  const cancel = async (taskId: string, title: string) => {
    const ok = await confirmDialog({
      title: `Cancel "${title}"?`,
      description:
        "It stops being shown and cannot be restarted. You are only ever charged for completions, so a cancelled task costs you nothing more.",
      tone: "danger",
      confirmLabel: "Cancel the task",
    });
    if (!ok) return;
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/tasks/mine/${taskId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not cancel");
      toast.success("Task cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusyId(null);
    }
  };

  /** Show a buyer the work they paid for. Read only — see the API note. */
  const openProof = async (taskId: string) => {
    if (proofFor === taskId) {
      setProofFor(null);
      return;
    }
    setProofFor(taskId);
    setProof(null);
    setStats(null);
    setReportFor(null);
    setProofLoading(true);
    try {
      const res = await fetch(`/api/tasks/mine/${taskId}/submissions`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load the work");
      setProof(data.submissions ?? []);
      setStats(data.stats ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the work");
      setProofFor(null);
    } finally {
      setProofLoading(false);
    }
  };

  /**
   * Flag ONE completion for an admin to look at again.
   *
   * Not a rejection, and the UI says so before the buyer types: the worker keeps
   * their points either way. What this buys is a human second opinion and a
   * record on the worker's account, which is where a repeat offender is
   * actually stopped.
   */
  const sendReport = async (taskId: string, submissionId: string) => {
    const reason = reportText.trim();
    if (reason.length < MIN_REPORT_REASON) {
      toast.error(
        `Say what is wrong with it — at least ${MIN_REPORT_REASON} characters.`
      );
      return;
    }
    setReporting(true);
    try {
      const res = await fetch(`/api/tasks/mine/${taskId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not send the report");
      toast.success("Sent — an admin will look at this one.");
      // Reflect it locally rather than refetching: the row is already on screen
      // and a full reload would collapse the panel the buyer is reading.
      setProof((rows) =>
        rows?.map((r) =>
          r.id === submissionId
            ? {
                ...r,
                reportable: false,
                report: {
                  status: "OPEN",
                  reason,
                  at: new Date().toISOString(),
                },
              }
            : r
        ) ?? rows
      );
      setStats((s) =>
        s ? { ...s, reportsUsed: data.reportsUsed ?? s.reportsUsed + 1 } : s
      );
      setReportFor(null);
      setReportText("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not send the report"
      );
    } finally {
      setReporting(false);
    }
  };

  /** Pause or resume one of the buyer's own tasks. */
  const setRunning = async (taskId: string, action: "pause" | "resume") => {
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/tasks/mine/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not update the task");
      toast.success(action === "pause" ? "Task paused" : "Task is live again");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const live = tasks.filter((t) => t.status === "ACTIVE").length;
  const awaiting = tasks.filter((t) => t.status === "PENDING_REVIEW").length;
  const delivered = tasks.reduce((s, t) => s + t.approvedCount, 0);
  // Credit SPENT on completions — the reward rows and the fee rows, both
  // stored negative. Deliberately not a dollar figure: nothing is charged in
  // dollars any more, so summing `amountUsd` reported $0.00 and looked broken.
  // Sum every non-purchase row and flip the sign: charges are negative, so
  // this comes out positive, and anything credited BACK nets itself off
  // instead of being ignored. Purchases are excluded because buying credit is
  // not spending it — leaving them in would make the figure go negative.
  const creditSpent = -invoices
    .filter((r) => !r.reference.startsWith("taskcredit_buy_"))
    .reduce((s, r) => s + r.points, 0);

  // What the live tasks still advertise. NOT "held" — nothing is reserved
  // under pay-as-you-go, and calling it held would tell a buyer their credit
  // is committed when it is free to spend anywhere.
  const advertised = tasks
    .filter((t) => t.status === "ACTIVE" || t.status === "PENDING_REVIEW")
    .reduce((s, t) => s + t.remainingBudget, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Buyer Hub</h1>
          <p className="text-sm text-(--app-ink-3)">
            Your tasks, what they cost, and who has completed them.
          </p>
        </div>
        <div className="flex gap-2">
        <Link
          href="/buy-points"
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold",
            TASK_CREDIT.chip
          )}
        >
          <Sparkles className="h-4 w-4" />
          Buy credit
        </Link>
        {canCreate && (
          <Link
            href="/create-task"
            className="inline-flex items-center gap-2 rounded-xl bg-(--app-cta) px-4 py-2.5 text-sm font-bold text-(--app-on-cta) hover:bg-(--app-cta)"
          >
            <Plus className="h-4 w-4" />
            New task
          </Link>
        )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Sparkles}
          label={TASK_CREDIT.label}
          value={pts(taskCredit)}
          sub={
            runway === null
              ? `${usd(taskCredit / (pointsPerUsd || 1000))} · nothing running`
              : daysOfCredit !== null
                ? `about ${runway.toLocaleString()} more completion${runway === 1 ? "" : "s"} · ~${daysOfCredit}d at ${pts(Math.round(burnPerDay))}/day`
                : `about ${runway.toLocaleString()} more completion${runway === 1 ? "" : "s"}`
          }
          tone={
            runway !== null && runway <= LOW_RUNWAY
              ? "text-amber-400"
              : TASK_CREDIT.text
          }
        />
        <Stat
          icon={ListChecks}
          label="Live tasks"
          value={String(live)}
          sub={awaiting ? `${awaiting} awaiting approval` : "none awaiting"}
        />
        <Stat
          icon={Users}
          label="Completions"
          value={delivered.toLocaleString()}
          sub="approved and paid"
        />
        <Stat
          icon={Receipt}
          label="Credit spent"
          value={pts(creditSpent)}
          sub={
            advertised > 0
              ? `${pts(advertised)} pts still advertised`
              : "nothing running"
          }
        />
      </div>

      {/* Warn BEFORE it runs out. A buyer who finds out at zero has already
          had tasks stop; this is the window where topping up costs them
          nothing but a click. */}
      {runway !== null && runway <= LOW_RUNWAY && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="flex-1 text-xs leading-relaxed text-amber-200/90">
            {runway === 0 ? (
              <>
                <span className="font-semibold">
                  Your credit can&rsquo;t cover another completion.
                </span>{" "}
                Live tasks stop as soon as they try to pay someone.
              </>
            ) : (
              <>
                <span className="font-semibold">
                  About {runway} completion{runway === 1 ? "" : "s"} of credit
                  left.
                </span>{" "}
                Your tasks stop when it runs out.
              </>
            )}
            {/* Whether they can act right now, without a second trip. */}
            {cashBalance > 0 ? (
              <>
                {" "}
                Your wallet holds {usd(cashBalance)} — enough for{" "}
                {pts(Math.floor(cashBalance * (pointsPerUsd || 1000)))} more
                credit.
              </>
            ) : (
              <> Your wallet is empty, so top it up first.</>
            )}
          </p>
          <Link
            href="/buy-points"
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold",
              TASK_CREDIT.chip
            )}
          >
            Top up
          </Link>
        </div>
      )}

      <div className="flex gap-2 rounded-xl border border-(--app-line) bg-(--app-page)/50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-[11px] leading-relaxed text-(--app-ink-3)">
          Submissions are checked automatically and reviewed by our team — you
          are not asked to approve them. That is deliberate: it means nobody can
          refuse work that was done properly, and it means you are never the one
          holding up someone&rsquo;s payment. Something wrong with one? Open
          &ldquo;See the work&rdquo; and flag that completion — an admin looks at
          it again. Flagging never takes a worker&rsquo;s payment back, and there
          is a limit per task, so it cannot become a rejection queue.
        </p>
      </div>

      {/*
        Getting from "I have money" to "my task is live" without an admin
        explaining it. Three things have to be true and they have to happen in
        order — a buyer who tries to publish on an empty balance gets a 402 and
        no idea which of the three steps they missed. Shown only while they have
        no tasks: once one exists they have clearly worked it out.
      */}
      {tasks.length === 0 && (
        <div className="glass rounded-xl p-4">
          <h2 className="text-sm font-bold text-white">
            Getting your first task live
          </h2>
          <p className="mt-0.5 text-[11px] text-(--app-ink-3)">
            Three steps. You are only ever charged as people complete the work.
          </p>
          <ol className="mt-3 space-y-2">
            {(
              [
                {
                  done: cashBalance > 0,
                  title: "Put money in your wallet",
                  body: `Deposit the amount you want to spend. You have ${usd(cashBalance)}.`,
                  href: "/deposit",
                  cta: "Deposit",
                },
                {
                  done: taskCredit > 0,
                  title: "Turn it into task credit",
                  body: `Credit is what pays workers. It is kept apart from earned points and can't be withdrawn. You have ${pts(taskCredit)} pts.`,
                  href: "/buy-points",
                  cta: "Buy credit",
                },
                {
                  done: false,
                  title: "Create your task",
                  body: "Pick what you want done and what one completion is worth. We'll show you how many people it can reach and how long it should take before you publish.",
                  href: "/create-task",
                  cta: "Create a task",
                },
              ] as const
            ).map((step, i) => (
              <li key={step.title} className="flex gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    step.done
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-(--app-surface-2) text-(--app-ink-3)"
                  )}
                >
                  {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white">
                    {step.title}
                  </p>
                  <p className="text-[11px] leading-relaxed text-(--app-ink-3)">
                    {step.body}
                  </p>
                </div>
                {!step.done && (
                  <Link
                    href={step.href}
                    className="h-fit shrink-0 rounded-lg border border-(--app-line) px-2.5 py-1 text-[11px] font-bold text-(--app-ink) hover:text-white"
                  >
                    {step.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex gap-1 border-b border-(--app-line)">
        {(
          [
            ["tasks", `My tasks (${tasks.length})`],
            ["invoices", `Invoices (${invoices.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px rounded-t-lg px-4 py-2.5 text-sm font-semibold",
              tab === id
                ? "border-b-2 border-(--app-accent-edge) text-white"
                : "text-(--app-ink-3) hover:text-(--app-ink-2)"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div className="space-y-3">
          {tasks.length === 0 && (
            <Empty
              title="No tasks yet"
              body="When you fund a task it appears here with its progress, its budget, and what you were charged."
            />
          )}
          {tasks.map((t) => {
            const st = STATUS[t.status] ?? {
              label: t.status,
              tone: "bg-(--app-ink-3)/10 text-(--app-ink-2) ring-(--app-ink-3)/20",
            };
            const pct =
              t.targetCount > 0
                ? Math.min(100, Math.round((t.approvedCount / t.targetCount) * 100))
                : 0;
            const spentPoints = t.budgetPoints - t.remainingBudget;
            return (
              <div
                key={t.id}
                className="glass rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {t.title}
                    </p>
                    <p className="text-[11px] text-(--app-ink-3)">
                      {t.type} · {t.pointsReward.toLocaleString()} pts each ·{" "}
                      {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                    {/* The answers are the whole product of a survey, so the
                        way to them is on the task, not buried in a menu. */}
                    {t.type === "SURVEY" && (
                      <Link
                        href={`/buyer/surveys/${t.id}`}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                      >
                        View responses
                      </Link>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
                      st.tone
                    )}
                  >
                    {st.label}
                  </span>
                </div>

                {/*
                  The reason an admin gave, shown to the person it was written
                  for. It was stored on the task and never surfaced, so a
                  rejected buyer could only guess what to change.
                */}
                {t.status === "REJECTED" && (
                  <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <div>
                      <p className="text-xs font-semibold text-red-300">
                        Why this was rejected
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-red-200/80">
                        {t.rejectionReason?.trim() ||
                          "No reason was recorded. Contact support if you need detail."}
                      </p>
                      <p className="mt-1 text-[11px] text-red-200/50">
                        Your unspent budget was refunded to your wallet.
                      </p>
                    </div>
                  </div>
                )}

                {t.status !== "REJECTED" && (
                  <>
                    <div>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-(--app-ink-3)">
                          {t.approvedCount.toLocaleString()} of{" "}
                          {t.targetCount.toLocaleString()} completed
                        </span>
                        <span className="tabular-nums text-(--app-ink-3)">
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-(--app-surface-2)">
                        <div
                          className="h-full rounded-full bg-(--app-cta)"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-(--app-ink-3)">
                      {/* "Still advertised", not "budget left": nothing is
                          reserved against this task, so calling the remainder
                          a budget would suggest the credit is already spoken
                          for when it is free to use anywhere. */}
                      <span>
                        Still advertised{" "}
                        <span className="tabular-nums text-(--app-ink-2)">
                          {pts(t.remainingBudget)}
                        </span>{" "}
                        of {pts(t.budgetPoints)} pts
                      </span>
                      <span>
                        Paid out{" "}
                        <span className="tabular-nums text-(--app-ink-2)">
                          {pts(spentPoints)}
                        </span>{" "}
                        pts
                      </span>
                      {t.pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-400/80">
                          <Clock className="h-3 w-3" />
                          {t.pendingCount} awaiting review
                        </span>
                      )}
                    </div>

                    {/* Stopping a task is the buyer's own call — it is their
                        task and their credit. Judging the WORK is not: that
                        stays with admins and auto-verification. */}
                    {(t.status === "ACTIVE" || t.status === "PAUSED") && (
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() =>
                          setRunning(
                            t.id,
                            t.status === "ACTIVE" ? "pause" : "resume"
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-white disabled:opacity-50"
                      >
                        {busyId === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : t.status === "ACTIVE" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        {t.status === "ACTIVE" ? "Pause task" : "Resume task"}
                      </button>
                    )}

                    {EDITABLE_STATUSES.has(t.status) && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => setEditingTask(t)}
                          className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-white disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => cancel(t.id, t.title)}
                          className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </>
                    )}

                    {t.approvedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => openProof(t.id)}
                        className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-semibold text-(--app-ink-2) hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {proofFor === t.id
                          ? "Hide the work"
                          : `See the work (${t.approvedCount})`}
                      </button>
                    )}

                    {proofFor === t.id && (
                      <div className="mt-2 space-y-2 rounded-lg border border-(--app-line) bg-(--app-page)/60 p-3">
                        {proofLoading && (
                          <p className="inline-flex items-center gap-1.5 text-xs text-(--app-ink-3)">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading…
                          </p>
                        )}
                        {!proofLoading && stats && (
                          <ResultsStrip stats={stats} />
                        )}
                        {!proofLoading && proof && proof.length === 0 && (
                          <p className="text-xs text-(--app-ink-3)">
                            Nothing approved yet.
                          </p>
                        )}
                        {!proofLoading &&
                          proof?.map((r) => (
                            <div
                              key={r.id}
                              className="rounded-md border border-(--app-line) bg-(--app-surface)/60 p-2.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px] text-(--app-ink-3)">
                                <span>{new Date(r.at).toLocaleString()}</span>
                                <span className={TASK_CREDIT.textStrong}>
                                  −{pts(r.pointsPaid)} pts
                                </span>
                              </div>
                              {r.proof && (
                                <p className="mt-1 wrap-break-word text-xs text-(--app-ink-2)">
                                  {/^https?:\/\//.test(r.proof.trim()) ? (
                                    <a
                                      href={r.proof.trim()}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                                    >
                                      {r.proof.trim()}
                                      <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                  ) : (
                                    r.proof
                                  )}
                                </p>
                              )}
                              {r.proofImages.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {r.proofImages.map((src) => (
                                    <a
                                      key={src}
                                      href={src}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                                    >
                                      View screenshot
                                    </a>
                                  ))}
                                </div>
                              )}

                              {/* The one judgement a buyer IS allowed to make:
                                  ask for a second opinion. It changes nothing
                                  by itself — see the copy below the button. */}
                              {r.report ? (
                                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-400/80">
                                  <Flag className="h-3 w-3" />
                                  {r.report.status === "OPEN"
                                    ? "Reported — an admin is looking at it"
                                    : r.report.status === "UPHELD"
                                      ? "Reported — an admin agreed with you"
                                      : "Reported — an admin found the work acceptable"}
                                </p>
                              ) : reportFor === r.id ? (
                                <div className="mt-2 space-y-1.5 rounded-md border border-amber-500/25 bg-amber-500/5 p-2">
                                  <textarea
                                    rows={2}
                                    autoFocus
                                    maxLength={MAX_REPORT_REASON}
                                    value={reportText}
                                    onChange={(e) => setReportText(e.target.value)}
                                    placeholder="What is wrong with this one? An admin reads this."
                                    className="w-full resize-none rounded-md border border-(--app-line) bg-(--app-page) px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                                  />
                                  <p className="text-[10px] leading-relaxed text-(--app-ink-3)">
                                    This does not undo the payment and does not
                                    reject the work — the worker keeps their
                                    points either way. An admin looks at it, and
                                    it goes on the record for that account.
                                  </p>
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={reporting}
                                      onClick={() => {
                                        setReportFor(null);
                                        setReportText("");
                                      }}
                                      className="rounded-md border border-(--app-line) px-2 py-1 text-[11px] font-semibold text-(--app-ink-3) hover:text-white disabled:opacity-50"
                                    >
                                      Never mind
                                    </button>
                                    <button
                                      type="button"
                                      disabled={reporting}
                                      onClick={() => sendReport(t.id, r.id)}
                                      className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 px-2.5 py-1 text-[11px] font-bold text-(--app-on-bright) hover:bg-amber-400 disabled:opacity-50"
                                    >
                                      {reporting && (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      )}
                                      Send to an admin
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                r.reportable &&
                                (stats === null ||
                                  stats.reportsUsed < stats.reportsAllowed) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReportFor(r.id);
                                      setReportText("");
                                    }}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-(--app-ink-3) hover:text-amber-400"
                                  >
                                    <Flag className="h-3 w-3" />
                                    Something wrong with this one?
                                  </button>
                                )
                              )}
                            </div>
                          ))}
                        <p className="text-[11px] leading-relaxed text-(--app-glyph)">
                          Approved work only, and without names — you are seeing
                          what was delivered, not who delivered it.
                          {stats && stats.reportsAllowed > 0 && (
                            <>
                              {" "}
                              You can report {stats.reportsAllowed -
                                stats.reportsUsed}{" "}
                              more completion
                              {stats.reportsAllowed - stats.reportsUsed === 1
                                ? ""
                                : "s"}{" "}
                              on this task, within {REPORT_WINDOW_DAYS} days of
                              each one.
                            </>
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-2">
          {invoices.length === 0 && (
            <Empty
              title="No invoices yet"
              body={
                feePercent > 0
                  ? `Credit you buy, and every completion it pays for — the reward and the ${feePercent}% fee on it.`
                  : "Credit you buy, and every completion it pays for."
              }
            />
          )}
          {invoices.map((r) => {
            const isPurchase = r.reference.startsWith("taskcredit_buy_");
            const isFee = r.reference.startsWith("task_fee_");
            // A credit purchase is the only row where dollars moved; every
            // other row moved credit.
            const incoming = isPurchase ? true : r.points > 0;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-(--app-line) bg-(--app-page)/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-(--app-ink)">
                    {r.description || r.reference}
                  </p>
                  <p className="text-[11px] text-(--app-ink-3)">
                    {new Date(r.createdAt).toLocaleString()}
                    {isFee && " · platform fee"}
                    {isPurchase && ` · +${pts(r.points)} credit`}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    incoming
                      ? "text-emerald-400"
                      : isFee
                        ? "text-(--app-ink-3)"
                        : TASK_CREDIT.textStrong
                  )}
                >
                  {isPurchase ? (
                    <>
                      −{usd(Math.abs(r.amountUsd))}
                    </>
                  ) : r.points === 0 ? (
                    <span className="text-[11px] font-medium text-(--app-glyph)">
                      no charge
                    </span>
                  ) : (
                    <>
                      {r.points > 0 ? "+" : "−"}
                      {pts(Math.abs(r.points))} pts
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          platforms={platforms}
          canTarget={canTarget}
          minPoints={minPoints}
          maxPoints={maxPoints}
          maxCompletions={maxCompletions}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * The full edit form — title, description, platform/action/link (SOCIAL
 * only), extra instructions, minimum level, reward + completions, and
 * audience targeting when granted. Same fields `/api/tasks/mine/[id]`
 * (PATCH) accepts, and nothing this form offers is something that route
 * would refuse.
 *
 * VIDEO tasks are editable here too, but only their title, description,
 * instructions, min level, reward, completions and audience — the route has
 * no way to change a video's link or watch-time (that lives in
 * `videoConfig`, on the task-creation route only), so those two are
 * deliberately not offered here; showing them would silently do nothing.
 */
function EditTaskModal({
  task,
  platforms,
  canTarget,
  minPoints,
  maxPoints,
  maxCompletions,
  onClose,
  onSaved,
}: {
  task: BuyerTaskRow;
  platforms: BuyerPlatform[];
  canTarget: boolean;
  minPoints: number;
  maxPoints: number;
  maxCompletions: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Reward and completion count freeze the moment a task goes live — people
  // picked it up on those terms. Mirrors the server's own `notYetLive` gate
  // so the buyer is never shown an input the API will silently ignore.
  const notYetLive = task.status === "PENDING_REVIEW";
  const isSocial = task.type === "SOCIAL";

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [socialPlatform, setSocialPlatform] = useState(task.socialPlatform ?? "");
  const [socialAction, setSocialAction] = useState(task.socialAction ?? "");
  const [socialUrl, setSocialUrl] = useState(task.socialUrl ?? "");
  const [minLevel, setMinLevel] = useState(task.minLevel ?? 1);
  const [pointsReward, setPointsReward] = useState(task.pointsReward);
  const [targetCount, setTargetCount] = useState(task.targetCount);
  const [audience, setAudience] = useState<TaskAudienceValue>({
    countries: task.countries ?? [],
    genders: task.genders ?? [],
    minAge: task.minAge ?? null,
    maxAge: task.maxAge ?? null,
    regions: task.regions ?? [],
    divisions: task.divisions ?? [],
    districts: task.districts ?? [],
    subDistricts: task.subDistricts ?? [],
    postalCodes: task.postalCodes ?? [],
  });
  const [saving, setSaving] = useState(false);

  const pickPlatform = (key: string) => {
    setSocialPlatform(key);
    setSocialAction("");
  };
  // A platform the buyer was allowed to pick when the task was created can
  // later be closed globally or blocked on this account. Dropping it from
  // the select would leave the field looking blank on an unchanged task, so
  // the current value stays selectable even if it can no longer be chosen
  // fresh.
  const platformOptions =
    socialPlatform && !platforms.some((p) => p.key === socialPlatform)
      ? [
          {
            key: socialPlatform,
            label: socialPlatform,
            emoji: "🔗",
            actions: socialAction
              ? [{ key: socialAction, label: socialAction }]
              : [],
          },
          ...platforms,
        ]
      : platforms;
  const platformDef = platformOptions.find((p) => p.key === socialPlatform);

  const save = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required");
      return;
    }
    if (isSocial && (!socialUrl.trim() || !socialAction.trim())) {
      toast.error("Social tasks need an action and a target URL");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim() || null,
        minLevel: Math.max(1, Math.floor(minLevel)),
      };
      if (isSocial) {
        body.socialPlatform = socialPlatform.trim() || null;
        body.socialAction = socialAction.trim() || null;
        body.socialUrl = socialUrl.trim() || null;
      }
      // Sent only while still awaiting review — the server ignores these
      // once live, but omitting them entirely avoids a request that reads
      // as though it is trying to change a frozen value.
      if (notYetLive) {
        body.pointsReward = Math.floor(pointsReward);
        body.targetCount = Math.floor(targetCount);
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
      const res = await fetch(`/api/tasks/mine/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save");
      toast.success(
        data.backToReview ? "Saved — back in the review queue" : "Saved"
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit task" subtitle={task.title} onClose={saving ? undefined : onClose}>
      <div className="space-y-3">
        {!notYetLive && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
            Saving sends this task back for review. It stops being shown to
            workers until an admin approves it again — what was approved has
            to be what people see.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
            Title *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
            Description *
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
          />
        </div>

        {isSocial && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
                  Platform *
                </label>
                <select
                  value={socialPlatform}
                  onChange={(e) => pickPlatform(e.target.value)}
                  className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
                >
                  <option value="">Choose…</option>
                  {platformOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.emoji} {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
                  Action *
                </label>
                <select
                  value={socialAction}
                  onChange={(e) => setSocialAction(e.target.value)}
                  disabled={!platformDef}
                  className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none disabled:opacity-50"
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
              <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
                Target URL *
              </label>
              <input
                value={socialUrl}
                onChange={(e) => setSocialUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
              />
            </div>
          </>
        )}

        {task.type === "VIDEO" && (
          <p className="text-[11px] leading-relaxed text-(--app-ink-3)">
            The video link and watch time can&rsquo;t be changed here — pause
            this task and create a new one to change either.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
            Additional instructions
          </label>
          <textarea
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Optional — extra detail shown alongside the task"
            className="w-full resize-none rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
              Points reward
            </label>
            <input
              type="number"
              min={1}
              value={pointsReward}
              disabled={!notYetLive}
              onChange={(e) => setPointsReward(Number(e.target.value))}
              className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
              Completions
            </label>
            <input
              type="number"
              min={1}
              value={targetCount}
              disabled={!notYetLive}
              onChange={(e) => setTargetCount(Number(e.target.value))}
              className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-(--app-ink-3)">
              Min level
            </label>
            <input
              type="number"
              min={1}
              value={minLevel}
              onChange={(e) => setMinLevel(Number(e.target.value))}
              className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white focus:border-(--app-accent-edge) focus:outline-none"
            />
          </div>
        </div>
        {notYetLive ? (
          <p className="text-[11px] text-(--app-ink-3)">
            Reward: {minPoints.toLocaleString()}–{maxPoints.toLocaleString()}{" "}
            pts · up to {maxCompletions.toLocaleString()} completions
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-(--app-ink-3)">
            Reward and completions are locked once a task is live — people
            picked it up on those terms. Pause it and create a new one to
            change either.
          </p>
        )}

        {canTarget && (
          <div className="space-y-2 border-t border-(--app-line) pt-3">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
              <Target className="h-3.5 w-3.5 text-(--app-accent-ink)" /> Audience
              targeting
            </h3>
            <TaskAudienceTargeting
              value={audience}
              onChange={(patch) => setAudience((a) => ({ ...a, ...patch }))}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-(--app-line) px-3 py-2 text-xs font-semibold text-(--app-ink-2) hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-(--app-cta) px-4 py-2 text-xs font-bold text-(--app-on-cta) hover:bg-(--app-cta) disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * What the money bought, for one task.
 *
 * A buyer could see a progress bar and nothing else: no cost per completion, no
 * accept rate, no sense of whether the task was moving or stuck. Those are the
 * four numbers an advertiser judges any channel on, and without them "is this
 * working?" could only be answered by feel.
 *
 * Cost figures come from the ledger rows that charged them, so this panel and
 * the Invoices tab cannot disagree.
 */
function ResultsStrip({ stats }: { stats: TaskStats }) {
  const cells: { label: string; value: string; sub?: string }[] = [
    {
      label: "Delivered",
      value: `${stats.approved.toLocaleString()}${stats.target > 0 ? ` / ${stats.target.toLocaleString()}` : ""}`,
      sub:
        stats.fillRate !== null
          ? `${Math.round(stats.fillRate * 100)}% of what you asked for`
          : undefined,
    },
    {
      label: "Cost per completion",
      value:
        stats.costPerCompletion !== null
          ? `${pts(Math.round(stats.costPerCompletion))} pts`
          : "—",
      sub:
        stats.feePaid > 0
          ? `${pts(stats.rewardPaid)} reward + ${pts(stats.feePaid)} fee`
          : "reward only — no fee charged",
    },
    {
      label: "Accepted",
      value:
        stats.acceptRate !== null
          ? `${Math.round(stats.acceptRate * 100)}%`
          : "—",
      sub:
        stats.rejected > 0
          ? `${stats.rejected.toLocaleString()} rejected, you paid for none of them`
          : "nothing rejected",
    },
    {
      label: "Pace",
      value:
        stats.perDay >= 1
          ? `${stats.perDay.toFixed(1)}/day`
          : stats.perDay > 0
            ? `${(stats.perDay * 7).toFixed(1)}/week`
            : "—",
      sub:
        stats.daysLeft !== null
          ? `about ${stats.daysLeft} day${stats.daysLeft === 1 ? "" : "s"} to fill`
          : stats.hoursToFirst !== null
            ? `first one after ${stats.hoursToFirst < 1 ? "<1" : Math.round(stats.hoursToFirst)}h`
            : undefined,
    },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-(--app-line) bg-(--app-surface)/40 p-2.5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-[10px] uppercase tracking-wide text-(--app-ink-3)">
              {c.label}
            </p>
            <p className="text-sm font-bold tabular-nums text-white">
              {c.value}
            </p>
            {c.sub && (
              <p className="text-[10px] leading-tight text-(--app-ink-3)">{c.sub}</p>
            )}
          </div>
        ))}
      </div>
      {/* Which audience actually delivered — aggregate only, no names. A buyer
          targeting five countries has no other way to learn that one of them
          did all the work. */}
      {stats.countries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-(--app-line) pt-2">
          <Globe className="h-3 w-3 shrink-0 text-(--app-ink-3)" />
          {stats.countries.map((c) => (
            <span
              key={c.country}
              className="rounded-full bg-(--app-surface-2)/80 px-2 py-0.5 text-[10px] font-semibold text-(--app-ink-2)"
            >
              {c.country} {c.count}
            </span>
          ))}
          {stats.pending > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/80">
              <Clock className="h-3 w-3" />
              {stats.pending} still in review
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "text-(--app-accent-ink)",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", tone)} />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-(--app-ink-3)">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums text-white">{value}</p>
      <p className="text-[11px] text-(--app-ink-3)">{sub}</p>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-(--app-line) p-8 text-center">
      <p className="text-sm font-semibold text-(--app-ink-2)">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-(--app-ink-3)">
        {body}
      </p>
    </div>
  );
}
