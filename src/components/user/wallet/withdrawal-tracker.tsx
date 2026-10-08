import { format } from "date-fns";
import { Check, ClipboardCheck, Send, Wallet, XCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A withdrawal's journey as visible steps — Submitted → Manual review →
 * Payment processing → Paid — instead of a bare "Pending". A payout that takes
 * days is fine when the user can see where it is and that a person is on it;
 * a "Pending" that never moves is what reads as a fake platform.
 *
 * Server-safe (no hooks): rendered on the withdrawal page and the dashboard.
 */

export interface TrackedWithdrawal {
  id: string;
  method: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  processedAt: Date | null;
  rejectionReason?: string | null;
}

type StepState = "done" | "current" | "todo" | "failed";

const methodName = (m: string) => {
  const map: Record<string, string> = {
    BITGET: "Bitget",
    BINANCE: "Binance",
    PAYPAL: "PayPal",
    BKASH: "bKash",
    NAGAD: "Nagad",
    ROCKET: "Rocket",
  };
  return map[m] ?? m.replace(/_/g, " ");
};

export function WithdrawalTracker({
  w,
  payoutMessage,
  compact = false,
}: {
  w: TrackedWithdrawal;
  /** Admin's "you'll receive funds in …" text, e.g. "3-7 business days". */
  payoutMessage?: string;
  compact?: boolean;
}) {
  const s = w.status;
  const failed = s === "REJECTED" || s === "CANCELLED";
  const reviewed = s === "PROCESSING" || s === "COMPLETED" || !!w.reviewedAt;
  const paid = s === "COMPLETED";
  const when = (d: Date | null) => (d ? format(d, "d MMM, HH:mm") : null);

  const steps: { title: string; detail: string; at: string | null; state: StepState; Icon: typeof Check }[] = [
    {
      title: "Submitted",
      detail: "Request received",
      at: when(w.createdAt),
      state: "done",
      Icon: ClipboardCheck,
    },
    {
      title: "Manual review",
      detail: failed && !reviewed ? "Reviewed — not approved" : "A team member checks every payout by hand to keep accounts safe",
      at: reviewed ? when(w.reviewedAt) : null,
      state: reviewed ? "done" : failed ? "failed" : "current",
      Icon: ShieldCheck,
    },
    {
      title: "Payment processing",
      detail: failed && reviewed ? "Stopped — not paid" : `Sending to your ${methodName(w.method)} account`,
      at: null,
      state: paid ? "done" : failed ? (reviewed ? "failed" : "todo") : reviewed ? "current" : "todo",
      Icon: Send,
    },
    {
      title: "Paid",
      detail: paid ? "Money sent" : "",
      at: paid ? when(w.processedAt) : null,
      state: paid ? "done" : "todo",
      Icon: Wallet,
    },
  ];

  const tone: Record<StepState, string> = {
    done: "bg-emerald-500 text-white ring-emerald-500/30",
    current: "bg-sky-500 text-white ring-sky-400/40 animate-pulse",
    todo: "bg-(--app-surface-2) text-(--app-ink-3) ring-(--app-line)",
    failed: "bg-red-500 text-white ring-red-500/30",
  };

  return (
    <div className={cn(compact ? "mt-3" : "mt-4")}>
      <ol className="relative grid grid-cols-4 gap-1">
        {steps.map((st, i) => (
          <li key={st.title} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2",
                  steps[i].state === "done" || steps[i].state === "current" ? "bg-emerald-500/70" : "bg-(--app-line)",
                  steps[i].state === "failed" && "bg-red-500/60"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-8 w-8 place-items-center rounded-full ring-4",
                tone[st.state]
              )}
            >
              {st.state === "done" ? (
                <Check className="h-4 w-4" />
              ) : st.state === "failed" ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <st.Icon className="h-4 w-4" />
              )}
            </span>
            <span
              className={cn(
                "mt-1.5 text-[11px] font-bold leading-tight sm:text-xs",
                st.state === "todo" ? "text-(--app-ink-3)" : "text-(--app-ink)",
                st.state === "failed" && "text-red-300"
              )}
            >
              {st.title}
            </span>
            {st.at && <span className="mt-0.5 text-[10px] text-(--app-ink-3)">{st.at}</span>}
            {!compact && st.state === "current" && (
              <span className="mt-1 hidden max-w-[11rem] text-[10px] leading-snug text-sky-300 sm:block">{st.detail}</span>
            )}
          </li>
        ))}
      </ol>

      {!failed && !paid && (
        <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs leading-relaxed text-(--app-ink-2)">
          <span className="font-semibold text-sky-300">
            {reviewed ? "Approved — your payment is on its way." : "Your request is in the review queue."}
          </span>{" "}
          {payoutMessage ? <>Payouts usually take {payoutMessage}. </> : null}
          The amount is held safely until it is paid; if it can&apos;t be paid, it returns to your wallet in full.
          <span className="ml-1 font-mono text-[10px] text-(--app-ink-3)">Ref #{w.id.slice(-8).toUpperCase()}</span>
        </div>
      )}
      {failed && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-(--app-ink-2)">
          <span className="font-semibold text-red-300">Not paid — the full amount is back in your wallet.</span>
          {w.rejectionReason ? <> Reason: {w.rejectionReason}</> : null}
        </div>
      )}
    </div>
  );
}
