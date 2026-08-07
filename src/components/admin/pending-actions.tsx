import Link from "next/link";
import {
  Shield,
  CheckCircle,
  DollarSign,
  ListTodo,
  XCircle,
  ChevronRight,
  Banknote,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingActionRow {
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: "purple" | "blue" | "green" | "yellow" | "red";
}

const TONES: Record<
  PendingActionRow["tone"],
  { bg: string; text: string; chipBg: string }
> = {
  purple: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    chipBg: "bg-purple-500/15 text-purple-400",
  },
  blue: {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    chipBg: "bg-blue-500/15 text-blue-400",
  },
  green: {
    bg: "bg-green-500/10",
    text: "text-green-400",
    chipBg: "bg-green-500/15 text-green-400",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    chipBg: "bg-yellow-500/15 text-yellow-400",
  },
  red: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    chipBg: "bg-red-500/15 text-red-400",
  },
};

interface PendingActionsProps {
  pendingKYC: number;
  pendingApprovals: number;
  pendingWithdrawals: number;
  pendingDeposits?: number;
  pendingOfferwall?: number;
  pendingAppeals: number;
  openDisputes: number;
}

export function PendingActions({
  pendingKYC,
  pendingApprovals,
  pendingWithdrawals,
  pendingDeposits = 0,
  pendingOfferwall = 0,
  pendingAppeals,
  openDisputes,
}: PendingActionsProps) {
  const rows: PendingActionRow[] = [
    {
      label: "Deposits to Review",
      count: pendingDeposits,
      href: "/admin/deposits",
      icon: Banknote,
      tone: "green",
    },
    {
      label: "Withdrawal Requests",
      count: pendingWithdrawals,
      href: "/admin/withdrawals",
      icon: DollarSign,
      tone: "green",
    },
    {
      label: "KYC Requests",
      count: pendingKYC,
      href: "/admin/users/kyc",
      icon: Shield,
      tone: "purple",
    },
    {
      label: "Account Approvals",
      count: pendingApprovals,
      href: "/admin/users?status=PENDING_VERIFICATION",
      icon: CheckCircle,
      tone: "blue",
    },
    {
      label: "Offerwall Completions",
      count: pendingOfferwall,
      href: "/admin/offerwalls",
      icon: Compass,
      tone: "blue",
    },
    {
      label: "Verification Appeals",
      count: pendingAppeals,
      href: "/admin/users/kyc?tab=appeals",
      icon: ListTodo,
      tone: "yellow",
    },
    {
      label: "Dispute Cases",
      count: openDisputes,
      href: "/admin/marketplace?tab=disputes",
      icon: XCircle,
      tone: "red",
    },
  ];

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Pending Actions</h3>
        <span className="text-xs text-slate-500">
          Click any row to act
        </span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const tone = TONES[r.tone];
          const Icon = r.icon;
          return (
            <Link
              key={r.label}
              href={r.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors group"
            >
              <div className={cn("p-2 rounded-lg shrink-0", tone.bg)}>
                <Icon className={cn("w-4 h-4", tone.text)} />
              </div>
              <span className="flex-1 text-sm text-slate-300 group-hover:text-white">
                {r.label}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                  tone.chipBg
                )}
              >
                {r.count.toLocaleString()}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
