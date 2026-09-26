import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * A user's task-fraud risk (User.fraudRisk, 0–100%) as a chip, for the screens
 * where money is about to leave — a finance admin paying a withdrawal should
 * see that the account is at 80% before sending the cash, not after.
 * Links to the Fraud Monitor, where the offences behind the number are listed.
 */
export function FraudRiskChip({ risk, withLabel = true }: { risk: number; withLabel?: boolean }) {
  const tone =
    risk >= 80
      ? "bg-red-500/15 text-red-300 border-red-500/40"
      : risk >= 50
        ? "bg-orange-500/15 text-orange-300 border-orange-500/40"
        : risk > 0
          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
          : "bg-slate-800 text-slate-400 border-slate-700";
  return (
    <Link
      href="/admin/fraud"
      title={risk > 0 ? `Task-fraud risk ${risk}% — see the offences on the Fraud Monitor` : "No fraud offences recorded"}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums hover:brightness-125 ${tone}`}
    >
      <ShieldAlert className="h-3 w-3" />
      {withLabel && "Fraud "}
      {risk}%
    </Link>
  );
}
