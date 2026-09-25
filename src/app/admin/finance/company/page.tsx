import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CompanyFinanceApp } from "@/components/admin/company-finance/company-finance-app";

export const dynamic = "force-dynamic";

/**
 * The company's own books: expenses, salaries, employees, payees, recurring
 * costs, VAT & tax, profit and loss, and who may see any of it.
 *
 * Gated on `finance.view`, which `stripProtectedForRole` gives to a super admin,
 * a finance admin, a finance moderator, and nobody else unless a super admin
 * granted it to them by name.
 */
export default async function CompanyFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "finance.view"))) redirect("/admin");
  const { tab } = await searchParams;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/finance" className="rounded-lg bg-slate-800 p-2 hover:bg-slate-700" aria-label="Back to the finance console">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
            <BookOpenCheck className="h-6 w-6 text-emerald-400" />
            Company books
          </h1>
          <p className="text-sm text-slate-400">
            What the company spends, who it pays, what it owes the tax office, and what is left.
          </p>
        </div>
      </div>
      <CompanyFinanceApp initialTab={tab} />
    </div>
  );
}
