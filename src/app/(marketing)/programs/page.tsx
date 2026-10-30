import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PageHero, Band, SectionHead, Steps, Btn, Faq, Closing } from "@/components/marketing/kit";
import { ProgramsMock } from "@/components/marketing/mocks";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo/breadcrumbs";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";
import { PROGRAMS, PROGRAM_KEYS, applyHrefFor } from "@/lib/application-requirements";
import { effectiveRequirements, getRequirementsConfig } from "@/lib/application-requirements-server";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Programs — Sell, Offer Services, Advertise, Teach",
    description: `Every program on ${COMPANY_NAME} in one place: seller, service provider, task buyer, advertiser, agency, affiliate, tutor, ambassador and the blue badge.`,
    path: "/programs",
  });
}

const STEPS = [
  { title: "Create an account", body: "Every program starts from a free account." },
  { title: "Check what it needs", body: "Each program lists its requirements and shows which ones you already meet." },
  { title: "Apply", body: "Our team reviews your application and emails you the decision." },
];

const FAQ = [
  {
    q: "Can I join more than one program?",
    a: "Yes. Each program has its own application, and one account can hold several.",
  },
  {
    q: "What do programs require?",
    a: "It depends on the program — for example a minimum account level, a completed profile, identity verification or a few questions about your plans. The application page shows which you already meet.",
  },
  {
    q: "How long does a review take?",
    a: "Applications are reviewed by our team and the decision is sent by email. You can check where yours stands on the applications page at any time.",
  },
  {
    q: "Is it free to apply?",
    a: "Yes. Applying to a program costs nothing. The blue badge can also be bought outright instead of waiting for a review.",
  },
];

export default async function ProgramsPage() {
  const cfg = await getRequirementsConfig().catch(() => null);
  const programs = await Promise.all(
    PROGRAM_KEYS.map(async (key) => {
      const req = cfg ? await effectiveRequirements(key, cfg).catch(() => null) : null;
      return { ...PROGRAMS[key], open: req?.enabled !== false, note: req?.note ?? "" };
    })
  );
  const open = programs.filter((p) => p.open);

  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Programs", path: "/programs" }])} />

      <PageHero
        kicker="Programs"
        title="One account."
        accent={`${open.length} ways to work with us.`}
        lead="Sell digital products, offer services, hire people for tasks, run ads, teach, refer members or get the verified badge. Pick what fits and apply in a few minutes."
        actions={
          <>
            <Btn href="/apply">Start an application</Btn>
            <Btn href="/register" variant="secondary">
              Create a free account
            </Btn>
          </>
        }
        note="Free to apply · Reviewed by our team"
        visual={<ProgramsMock programs={open.map((p) => p.label)} />}
      />

      <Band id="list" labelledBy="list-title">
        <SectionHead
          id="list-title"
          n="01"
          label="Programs"
          title="Choose what fits you"
          lead="Every program is open to anyone who meets its requirements. You can hold more than one."
        />
        <ul className="border-t border-(--mk-border)">
          {open.map((p, i) => (
            <li key={p.key} className="mkx-row mkx-reveal border-b border-(--mk-border)">
              <Link
                href={applyHrefFor(p.key)}
                className="mk-focus group grid gap-3 py-7 sm:grid-cols-12 sm:gap-8"
              >
                <div className="flex items-baseline gap-4 sm:col-span-4">
                  <span className="mkx-num w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="mkx-h3 text-xl!">{p.label}</h3>
                    <p className="mkx-body mt-1.5">{p.blurb}</p>
                  </div>
                </div>
                <ul className="space-y-1.5 pl-10 sm:col-span-6 sm:pl-0">
                  {p.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[0.9375rem] text-(--mk-muted)">
                      <Check aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-(--mk-accent)" />
                      {b}
                    </li>
                  ))}
                  {p.note && <li className="pt-1 text-sm text-(--mk-subtle)">{p.note}</li>}
                </ul>
                <span className="mkx-arrow inline-flex items-center gap-1.5 self-start pl-10 text-sm font-semibold text-(--mk-accent) sm:col-span-2 sm:justify-end sm:pl-0">
                  {p.key === "BLUE_BADGE" ? "Get the badge" : "Apply"} <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band labelledBy="how-title" alt>
        <SectionHead id="how-title" n="02" label="How it works" title="Three steps to get started" />
        <Steps items={STEPS} />
      </Band>

      <Band labelledBy="faq-title">
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <Closing
        title="Ready to apply?"
        lead="Sign in to see each program's requirements and where your application stands."
        primary={{ href: "/apply", label: "Go to applications" }}
        secondary={{ href: "/register", label: "Create a free account" }}
      />
    </>
  );
}
