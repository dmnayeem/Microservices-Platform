import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth";
import { TransactionHistory } from "@/components/user/wallet/transaction-history";

/**
 * The money record, on its own page.
 *
 * It existed only as a tab inside the wallet, mixed in with every completed
 * task — and on an active account the earnings drown everything else, so
 * "when did my withdrawal go out" or "what did that credit purchase cost"
 * became unanswerable by scrolling.
 *
 * Here the default is money moving: deposits, withdrawals, conversions,
 * purchases, task credit, fees, refunds. The work log is one tap away rather
 * than in the way.
 */
export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <Link
          href="/wallet"
          className="mt-0.5 rounded-lg border border-(--app-line) p-2 text-(--app-ink-3) hover:text-white"
          aria-label="Back to wallet"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="inline-flex items-center gap-2 text-xl font-bold text-white">
            <Receipt className="h-5 w-5 text-(--app-accent-ink)" />
            Transactions
          </h1>
          <p className="mt-0.5 text-sm text-(--app-ink-3)">
            Every movement of money on your account.
          </p>
        </div>
      </header>

      <TransactionHistory defaultKind="money" showKindToggle />
    </div>
  );
}
