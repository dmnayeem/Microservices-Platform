"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Users,
  Building2,
  Repeat,
  Landmark,
  Settings2,
  ShieldCheck,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Loading, useFinanceMeta, type Meta } from "./ui";
import { OverviewTab } from "./overview-tab";
import { EntriesTab } from "./entries-tab";
import { SalaryTab } from "./salary-tab";
import { EmployeesTab } from "./employees-tab";
import { PayeesTab } from "./payees-tab";
import { RecurringTab } from "./recurring-tab";
import { TaxTab } from "./tax-tab";
import { SettingsTab } from "./settings-tab";
import { TeamTab } from "./team-tab";

type TabId =
  | "overview"
  | "entries"
  | "salaries"
  | "employees"
  | "payees"
  | "recurring"
  | "tax"
  | "settings"
  | "team";

const TABS: { id: TabId; label: string; icon: LucideIcon; show: (m: Meta) => boolean }[] = [
  { id: "overview", label: "Profit & loss", icon: LayoutDashboard, show: () => true },
  { id: "entries", label: "Expenses & income", icon: Receipt, show: () => true },
  { id: "salaries", label: "Salaries", icon: Wallet, show: (m) => m.can.hrView },
  { id: "employees", label: "Employees", icon: Users, show: (m) => m.can.hrView },
  { id: "payees", label: "Payees", icon: Building2, show: () => true },
  { id: "recurring", label: "Recurring", icon: Repeat, show: () => true },
  { id: "tax", label: "VAT & tax", icon: Landmark, show: () => true },
  { id: "settings", label: "Categories & fields", icon: Settings2, show: (m) => m.can.settings },
  { id: "team", label: "Finance team", icon: ShieldCheck, show: (m) => m.can.staff },
];

/**
 * The company's own books — expenses, HR, tax — as one screen.
 *
 * A tab the viewer has no permission for is not rendered at all, rather than
 * rendered and refused: a finance moderator never sees a "Salaries" tab they
 * cannot open. The server still refuses every call independently; hiding the
 * tab is courtesy, not security.
 */
export function CompanyFinanceApp({ initialTab }: { initialTab?: string }) {
  const { meta, error, reload } = useFinanceMeta();
  const [tab, setTab] = useState<TabId>((initialTab as TabId) || "overview");

  // Keep the tab in the URL, so a link to "Salaries" opens Salaries and the
  // back button behaves.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("tab") !== tab) {
      u.searchParams.set("tab", tab);
      window.history.replaceState(null, "", u.toString());
    }
  }, [tab]);

  if (error) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
        <AlertTriangle className="h-4 w-4" /> {error}
      </p>
    );
  }
  if (!meta) return <Loading />;

  const visible = TABS.filter((t) => t.show(meta));
  const active = visible.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className="space-y-5">
      <div className="-mx-1 overflow-x-auto">
        <div className="flex min-w-max gap-1 px-1">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active === t.id
                    ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {active === "overview" && <OverviewTab meta={meta} />}
      {active === "entries" && <EntriesTab meta={meta} />}
      {active === "salaries" && <SalaryTab meta={meta} />}
      {active === "employees" && <EmployeesTab meta={meta} onChanged={reload} />}
      {active === "payees" && <PayeesTab meta={meta} onChanged={reload} />}
      {active === "recurring" && <RecurringTab meta={meta} />}
      {active === "tax" && <TaxTab meta={meta} />}
      {active === "settings" && <SettingsTab meta={meta} onChanged={reload} />}
      {active === "team" && <TeamTab />}
    </div>
  );
}
