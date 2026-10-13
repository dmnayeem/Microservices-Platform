import Link from "next/link";
import {
  ListTodo,
  Hourglass,
  Send,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Wallet,
  Bell,
  Users,
  UserCog,
} from "lucide-react";
import { usd } from "@/lib/utils";

/**
 * Dashboard "at a glance" cards: where the member's task work stands, their
 * withdrawals, profile + team, and the latest notifications. Server
 * components — every figure arrives as a prop from the dashboard page, which
 * reads it for the signed-in member only.
 */

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function CardHead({ title, href, cta }: { title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="t-section text-white">{title}</h2>
      {href && (
        <Link
          href={href}
          className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
        >
          {cta ?? "View all"}
        </Link>
      )}
    </div>
  );
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface TaskGlance {
  /** Active tasks this member may see (same rules as /tasks). null = unknown. */
  available: number | null;
  /** Opened, not sent yet. */
  inProgress: number;
  /** Sent, waiting for review. */
  submitted: number;
  /** The reviewer asked for changes. */
  needsChanges: number;
  approved: number;
  rejected: number;
  /** Points the submitted work pays if approved (task rewards). */
  awaitingPoints: number;
  rejections: Array<{ id: string; title: string; reason: string | null; at: Date }>;
}

export function TaskStatusCard({ t, pointsPerUsd }: { t: TaskGlance; pointsPerUsd: number }) {
  const rows = [
    { label: "Open to you", value: t.available, icon: ListTodo, tone: "text-(--app-ink-2)" },
    { label: "In progress", value: t.inProgress, icon: Hourglass, tone: "text-sky-400" },
    { label: "Submitted · in review", value: t.submitted, icon: Send, tone: "text-amber-400" },
    ...(t.needsChanges
      ? [{ label: "Changes requested", value: t.needsChanges, icon: RotateCcw, tone: "text-orange-400" }]
      : []),
    { label: "Approved", value: t.approved, icon: CheckCircle2, tone: "text-emerald-400" },
    { label: "Rejected", value: t.rejected, icon: XCircle, tone: "text-red-400" },
  ];
  return (
    <section className="app-card min-w-0">
      <CardHead title="My Tasks" href="/tasks" cta="Tasks" />
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label}>
            <Link
              href="/tasks"
              className="app-press app-tap-row flex items-center gap-3 rounded-(--app-r-control) px-2 hover:bg-(--app-surface-2)"
            >
              <r.icon className={`h-4.5 w-4.5 shrink-0 ${r.tone}`} />
              <span className="min-w-0 flex-1 truncate text-sm text-(--app-ink-2)">{r.label}</span>
              <span className="text-sm font-bold tabular-nums text-white">
                {r.value === null ? "—" : r.value.toLocaleString("en-US")}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {t.submitted > 0 && (
        <p className="mt-2 rounded-(--app-r-control) bg-(--app-surface-2) px-3 py-2 text-xs text-(--app-ink-2)">
          Pending: <span className="font-bold text-white">{t.awaitingPoints.toLocaleString("en-US")} pts</span>{" "}
          (≈ {usd(t.awaitingPoints / (pointsPerUsd || 1))}) if your submitted work is approved.
        </p>
      )}

      {t.rejections.length > 0 && (
        <div className="mt-3">
          <p className="t-meta mb-1.5 text-(--app-ink-3)">Latest rejections</p>
          <ul className="space-y-2">
            {t.rejections.map((r) => (
              <li key={r.id} className="rounded-(--app-r-control) border border-(--app-line-subtle) px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-white">{r.title}</p>
                  <span className="shrink-0 text-xs text-(--app-ink-3)">{shortDate(r.at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-(--app-ink-2)">
                  {r.reason?.trim() || "No reason was given."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Withdrawals ─────────────────────────────────────────────────────────────

export interface WithdrawalGlance {
  cash: number;
  min: number;
  enabled: boolean;
  subscriptionRequired: boolean;
  payoutMessage: string;
  open: { count: number; amount: number };
  recent: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: Date;
    rejectionReason: string | null;
  }>;
}

const W_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Requested", cls: "text-amber-400" },
  PROCESSING: { label: "Processing", cls: "text-sky-400" },
  COMPLETED: { label: "Paid", cls: "text-emerald-400" },
  REJECTED: { label: "Rejected", cls: "text-red-400" },
  CANCELLED: { label: "Cancelled", cls: "text-(--app-ink-3)" },
};

export function WithdrawalsCard({ w }: { w: WithdrawalGlance }) {
  const short = Math.max(0, w.min - w.cash);
  return (
    <section className="app-card min-w-0">
      <CardHead title="Withdrawals" href="/wallet" cta="Wallet" />
      <div className="grid grid-cols-2 gap-2">
        <div className="app-tile min-w-0">
          <p className="t-meta text-(--app-ink-3)">Minimum</p>
          <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">{usd(w.min)}</p>
        </div>
        <div className="app-tile min-w-0">
          <p className="t-meta text-(--app-ink-3)">On the way</p>
          <p className="mt-0.5 text-base font-extrabold tabular-nums text-white">
            {w.open.count ? usd(w.open.amount) : "—"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-(--app-ink-2)">
        {!w.enabled
          ? w.subscriptionRequired
            ? "Withdrawals need an active plan."
            : "Withdrawals are not available on your account right now."
          : short > 0
            ? `${usd(short)} more cash and you can withdraw. Payouts take ${w.payoutMessage}.`
            : `You can withdraw now. Payouts take ${w.payoutMessage}.`}
      </p>

      {w.recent.length > 0 ? (
        <ul className="mt-3 divide-y divide-(--app-line-subtle)">
          {w.recent.map((r) => {
            const st = W_STATUS[r.status] ?? { label: r.status, cls: "text-(--app-ink-2)" };
            return (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 shrink-0 text-(--app-ink-3)" />
                  <span className="min-w-0 flex-1 truncate text-sm text-(--app-ink-2)">
                    {r.method.replace(/_/g, " ").toLowerCase()} · {shortDate(r.createdAt)}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-white">{usd(r.amount)}</span>
                  <span className={`w-20 shrink-0 text-right text-xs font-bold ${st.cls}`}>{st.label}</span>
                </div>
                {r.status === "REJECTED" && r.rejectionReason && (
                  <p className="mt-0.5 line-clamp-2 pl-6 text-xs text-(--app-ink-3)">{r.rejectionReason}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-(--app-ink-3)">No withdrawals yet.</p>
      )}
    </section>
  );
}

// ─── Profile + team ──────────────────────────────────────────────────────────

export function ProfileTeamCard({
  profile,
  team,
}: {
  profile: { percentage: number; missing: Array<{ key: string; label: string; href?: string }> };
  team: { referrals: number; teamPoints30: number };
}) {
  const next = profile.missing.slice(0, 3);
  return (
    <section className="app-card min-w-0">
      <CardHead title="Profile & Team" />
      <div className="flex items-center gap-3">
        <UserCog className="h-5 w-5 shrink-0 text-(--app-ink-3)" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-white">Profile complete</p>
            <p className="text-sm font-extrabold tabular-nums text-white">{profile.percentage}%</p>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--app-surface-2)"
            role="progressbar"
            aria-valuenow={profile.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completion"
          >
            <div className="h-full rounded-full bg-(image:--app-grad)" style={{ width: `${profile.percentage}%` }} />
          </div>
        </div>
      </div>
      {next.length > 0 && (
        <ul className="mt-2">
          {next.map((m) => (
            <li key={m.key}>
              <Link
                href={m.href ?? "/profile"}
                className="app-press app-tap-row flex items-center justify-between gap-2 rounded-(--app-r-control) px-2 text-sm text-(--app-ink-2) hover:bg-(--app-surface-2)"
              >
                <span className="truncate">{m.label}</span>
                <span className="shrink-0 text-xs font-bold text-(--app-accent-ink)">Finish →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-(--app-line-subtle) pt-3">
        <Link
          href="/referrals"
          className="app-press app-tap-row flex items-center gap-3 rounded-(--app-r-control) px-2 hover:bg-(--app-surface-2)"
        >
          <Users className="h-4.5 w-4.5 shrink-0 text-pink-400" />
          <span className="min-w-0 flex-1 text-sm text-(--app-ink-2)">
            <span className="block truncate">People you invited</span>
            <span className="block truncate text-xs text-(--app-ink-3)">
              {team.teamPoints30.toLocaleString("en-US")} pts from your team · 30 days
            </span>
          </span>
          <span className="text-sm font-bold tabular-nums text-white">{team.referrals.toLocaleString("en-US")}</span>
        </Link>
      </div>
    </section>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function NotificationsCard({
  items,
}: {
  items: Array<{ id: string; title: string; message: string; createdAt: Date; isRead: boolean }>;
}) {
  return (
    <section className="app-card min-w-0">
      <CardHead title="Notifications" href="/notifications" />
      {items.length === 0 ? (
        <p className="text-xs text-(--app-ink-3)">Nothing new.</p>
      ) : (
        <ul className="divide-y divide-(--app-line-subtle)">
          {items.map((n) => (
            <li key={n.id}>
              <Link href="/notifications" className="app-press flex min-h-11 gap-2.5 py-2 hover:bg-(--app-surface-2)">
                <Bell className={`mt-0.5 h-4 w-4 shrink-0 ${n.isRead ? "text-(--app-ink-3)" : "text-(--app-accent-ink)"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${n.isRead ? "text-(--app-ink-2)" : "font-semibold text-white"}`}>
                    {n.title}
                  </span>
                  <span className="block line-clamp-1 text-xs text-(--app-ink-3)">{n.message}</span>
                </span>
                <span className="shrink-0 text-xs text-(--app-ink-3)">{shortDate(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
