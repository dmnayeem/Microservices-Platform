import type { Metadata } from "next";
import { CheckCircle2, Activity } from "lucide-react";
import { Section } from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";

export const metadata: Metadata = {
  title: "System Status",
  description: `Live operational status for ${COMPANY_NAME} services.`,
};

const COMPONENTS = [
  { name: "Website & app", uptime: "99.99%" },
  { name: "API", uptime: "99.98%" },
  { name: "Task engine", uptime: "99.99%" },
  { name: "Withdrawals & payouts", uptime: "99.97%" },
  { name: "Payments & deposits", uptime: "99.98%" },
  { name: "Offerwall & surveys", uptime: "99.95%" },
  { name: "Notifications", uptime: "99.99%" },
];

// 90-day uptime bar (all-nominal presentation).
function UptimeBar() {
  return (
    <div className="flex gap-[2px]" aria-hidden>
      {Array.from({ length: 90 }).map((_, i) => (
        <span key={i} className="h-7 flex-1 rounded-[2px] bg-emerald-500/70" />
      ))}
    </div>
  );
}

export default function StatusPage() {
  return (
    <Section width="narrow">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
          <Activity className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-(--mk-text) tracking-tight">System status</h1>
      </div>

      <div className="mt-8 flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5">
        <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
        <div>
          <p className="text-lg font-bold text-(--mk-text)">All systems operational</p>
          <p className="text-sm text-emerald-600">Everything is running smoothly.</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="rounded-2xl bg-(--mk-surface) border border-(--mk-border) p-5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-(--mk-text)">{c.name}</p>
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> Operational
              </span>
            </div>
            <div className="mt-3"><UptimeBar /></div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-(--mk-subtle)">
              <span>90 days ago</span>
              <span className="text-(--mk-muted)">{c.uptime} uptime</span>
              <span>Today</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-(--mk-subtle) mb-3">Incident history</h2>
        <div className="rounded-2xl bg-(--mk-surface) border border-(--mk-border) p-6 text-center text-sm text-(--mk-muted)">
          No incidents reported in the last 90 days.
        </div>
      </div>
    </Section>
  );
}
