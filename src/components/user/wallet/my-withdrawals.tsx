import { format } from "date-fns";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { usd } from "@/lib/utils";
import { mediaSrc } from "@/lib/media-url";

export interface MyWithdrawal {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  method: string;
  status: string;
  createdAt: Date;
  processedAt: Date | null;
  transactionId: string | null;
  paidFrom: string | null;
  adminNote: string | null;
  paymentProof: string[];
  rejectionReason: string | null;
}

const STATUS: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  PENDING: { label: "Waiting for review", tone: "text-amber-300 bg-amber-500/10", Icon: Clock },
  PROCESSING: { label: "Approved — being paid", tone: "text-sky-300 bg-sky-500/10", Icon: Loader2 },
  COMPLETED: { label: "Paid", tone: "text-emerald-300 bg-emerald-500/10", Icon: CheckCircle2 },
  REJECTED: { label: "Rejected — money returned", tone: "text-red-300 bg-red-500/10", Icon: XCircle },
};

/**
 * The user's own withdrawals, with everything recorded when each was paid: the
 * payment reference, the account it was sent from, the team's note and the
 * payment screenshot. There was no such list before — a user could request a
 * withdrawal and then see only a ledger line.
 */
export function MyWithdrawals({ items }: { items: MyWithdrawal[] }) {
  return (
    <section id="history" className="mt-6 scroll-mt-20">
      <h2 className="mb-3 text-base font-bold text-white">My withdrawals</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 text-sm text-(--app-ink-3)">
          You have not requested a withdrawal yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((w) => {
            const st = STATUS[w.status] ?? STATUS.PENDING;
            return (
              <li key={w.id} className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold tabular-nums text-white">{usd(w.netAmount)}</p>
                    <p className="text-xs text-(--app-ink-3)">
                      {w.method.replace(/_/g, " ")} · requested {format(w.createdAt, "d MMM yyyy, HH:mm")}
                      {w.fee > 0 && ` · ${usd(w.amount)} − ${usd(w.fee)} fee`}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${st.tone}`}>
                    <st.Icon className="h-3.5 w-3.5" />
                    {st.label}
                  </span>
                </div>

                {w.status === "COMPLETED" && (
                  <dl className="mt-3 grid gap-1.5 text-sm">
                    {w.processedAt && (
                      <Row label="Paid on" value={format(w.processedAt, "d MMM yyyy, HH:mm")} />
                    )}
                    {w.transactionId && <Row label="Payment reference" value={w.transactionId} mono />}
                    {w.paidFrom && <Row label="Sent from" value={w.paidFrom} />}
                  </dl>
                )}
                {w.status === "REJECTED" && w.rejectionReason && (
                  <p className="mt-3 text-sm text-(--app-ink-2)">
                    <span className="text-(--app-ink-3)">Reason: </span>
                    {w.rejectionReason}
                  </p>
                )}
                {w.adminNote && (w.status === "COMPLETED" || w.status === "REJECTED") && (
                  <p className="mt-2 rounded-lg bg-(--app-page) px-3 py-2 text-sm text-(--app-ink-2) whitespace-pre-wrap">
                    {w.adminNote}
                  </p>
                )}
                {w.paymentProof.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {w.paymentProof.map((u) => (
                      <a key={u} href={mediaSrc(u)} target="_blank" rel="noopener noreferrer" title="Open the payment screenshot">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaSrc(u)}
                          alt="Payment screenshot"
                          className="h-20 w-auto rounded-lg border border-(--app-line) object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt className="text-(--app-ink-3)">{label}</dt>
      <dd className={`min-w-0 break-all text-white ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
