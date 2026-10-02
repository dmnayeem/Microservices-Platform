"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Clock, XCircle, X, ChevronRight } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import type { MyWithdrawal } from "@/components/user/wallet/my-withdrawals";

/**
 * What happened to your withdrawal, at the top of the wallet.
 *
 *   - pending / being paid → an orange card, for as long as it is open;
 *   - paid → a green card, and rejected → a red card with the reason. Each of
 *     these shows on the first visit after it happened and is then gone; the
 *     permanent record is the list on the Withdraw tab.
 *
 * "Seen" is kept in this browser (localStorage). Clearing it only means a
 * recent result shows once more.
 */

const SEEN_PREFIX = "rt-wd-seen:";
/** A result older than this is history, not news. */
const RECENT_MS = 30 * 86_400_000;

function wasSeen(id: string): boolean {
  try {
    return !!localStorage.getItem(SEEN_PREFIX + id);
  } catch {
    return false;
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {
    /* private mode — it just shows again next time */
  }
}

const method = (m: string) => m.replace(/_/g, " ");

export function WithdrawalStatusCards({
  items,
  onOpenRecord,
}: {
  items: MyWithdrawal[];
  /** Opens the full withdrawal record (the Withdraw tab). */
  onOpenRecord: () => void;
}) {
  const open = items.filter((w) => w.status === "PENDING" || w.status === "PROCESSING");

  // Results to announce: decided recently and not yet seen on this device.
  // Decided once, after mount — the server render has no localStorage.
  const [news, setNews] = useState<MyWithdrawal[]>([]);
  // Once per mount: a second run (React strict mode) would find them already
  // marked seen and hide the cards on the very visit they are meant for.
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const now = Date.now();
    const fresh = items.filter(
      (w) =>
        (w.status === "COMPLETED" || w.status === "REJECTED") &&
        now - new Date(w.processedAt ?? w.createdAt).getTime() < RECENT_MS &&
        !wasSeen(w.id)
    );
    // Shown this visit, gone the next: mark as seen as soon as it is on screen.
    fresh.forEach((w) => markSeen(w.id));
    void Promise.resolve().then(() => setNews(fresh));
  }, [items]);

  if (open.length === 0 && news.length === 0) return null;

  return (
    <div className="space-y-2">
      {open.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={onOpenRecord}
          className="app-press flex w-full items-center gap-3 rounded-(--app-r-card) border border-amber-500/40 bg-amber-500/10 p-3 text-left sm:p-4"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-300">
            <Clock className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-amber-200">
              {w.status === "PROCESSING" ? "Withdrawal approved — being sent" : "Withdrawal pending"}
            </span>
            <span className="block text-xs text-amber-100/80">
              {usd(w.netAmount)} · {method(w.method)} · requested {format(new Date(w.createdAt), "d MMM, h:mm a")}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-amber-300" />
        </button>
      ))}

      {news.map((w) => {
        const paid = w.status === "COMPLETED";
        const when = format(new Date(w.processedAt ?? w.createdAt), "d MMM yyyy, h:mm a");
        return (
          <div
            key={w.id}
            role="status"
            className={cn(
              "relative flex items-start gap-3 rounded-(--app-r-card) border p-3 pr-10 sm:p-4 sm:pr-11",
              paid ? "border-emerald-500/40 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"
            )}
          >
            <span
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                paid ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
              )}
            >
              {paid ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-bold", paid ? "text-emerald-200" : "text-red-200")}>
                {paid ? `Withdrawal successful — ${usd(w.netAmount)} sent` : `Withdrawal rejected — ${usd(w.amount)} returned to your wallet`}
              </p>
              <p className={cn("mt-0.5 text-xs", paid ? "text-emerald-100/80" : "text-red-100/80")}>
                {method(w.method)} · {paid ? "paid" : "rejected"} {when}
                {paid && w.transactionId && (
                  <span className="block truncate" title={w.transactionId}>ref {w.transactionId}</span>
                )}
              </p>
              {!paid && w.rejectionReason && (
                <p className="mt-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                  <span className="font-semibold">Reason:</span> {w.rejectionReason}
                </p>
              )}
              <button
                type="button"
                onClick={onOpenRecord}
                className={cn("mt-1.5 text-xs font-semibold underline-offset-2 hover:underline", paid ? "text-emerald-300" : "text-red-300")}
              >
                See all withdrawals
              </button>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNews((cur) => cur.filter((x) => x.id !== w.id))}
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-(--app-ink-3) hover:bg-white/10 hover:text-(--app-ink)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
