import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Info } from "lucide-react";
import { Section } from "@/components/marketing/ui";
import { COMPANY_NAME, SUPPORT_EMAIL } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "System Status",
    description: `The services that make up ${COMPANY_NAME} and how to report a problem with any of them.`,
    path: "/status",
  });
}

/*
 * This page used to show "All systems operational", a 99.9x% uptime figure per
 * service and "No incidents in the last 90 days" — all hard-coded, none of it
 * measured. Until a real monitor feeds this page, it describes the services
 * and how to report a fault, and claims nothing about their current state.
 */
const COMPONENTS = [
  { name: "Website & app", body: "Sign-in, the dashboard and every public page." },
  { name: "Task engine", body: "Task lists, proof submission, automatic checks and reviews." },
  { name: "Marketplace & courses", body: "Listings, purchases, downloads, escrow deals and course playback." },
  { name: "Wallet & withdrawals", body: "Balances, point conversion and payout requests." },
  { name: "Deposits & plans", body: "Adding funds and buying optional paid plans." },
  { name: "Offerwalls & partner offers", body: "Offers from partner networks and their completion callbacks." },
  { name: "Notifications", body: "In-app notifications, push and email." },
];

export default function StatusPage() {
  return (
    <Section width="narrow">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/15 border border-(--mk-success)/30">
          <Activity className="h-7 w-7 text-(--mk-success)" aria-hidden />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-(--mk-text) tracking-tight">System status</h1>
        <p className="mt-4 text-(--mk-muted)">The services that make up {COMPANY_NAME}, and what to do if one of them is not working for you.</p>
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl mk-card p-5">
        <Info className="mt-0.5 h-5 w-5 text-(--mk-accent) shrink-0" aria-hidden />
        <div>
          <h2 className="text-base font-bold text-(--mk-text)">Something not working?</h2>
          <p className="mt-1 text-sm text-(--mk-muted) leading-relaxed">
            Maintenance and known problems may be announced to members in the app. If you hit an error that is not explained there, tell us what you were doing and when through the{" "}
            <Link href="/contact" className="font-semibold text-(--mk-accent) hover:underline">contact form</Link>{" "}
            or at <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-(--mk-accent) hover:underline">{SUPPORT_EMAIL}</a>. The{" "}
            <Link href="/help" className="font-semibold text-(--mk-accent) hover:underline">Help Center</Link>{" "}
            covers common account, task and payout questions.
          </p>
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-sm font-bold uppercase tracking-wider text-(--mk-subtle)">Services</h2>
      <div className="space-y-3">
        {COMPONENTS.map((c) => (
          <div key={c.name} className="rounded-2xl mk-card p-5">
            <h3 className="font-semibold text-(--mk-text)">{c.name}</h3>
            <p className="mt-1 text-sm text-(--mk-muted)">{c.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
