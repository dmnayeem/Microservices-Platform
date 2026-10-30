import type { ReactNode } from "react";
import { ClipboardList, Play, Check, Award, Link2, Copy } from "lucide-react";
import { BrandIcon } from "@/components/ui/brand-icon";
import { Chip, Window } from "@/components/marketing/kit";

/**
 * Product surfaces for the feature-page heroes, rebuilt in markup so they
 * theme with the page and cost no image request. Every figure in them is
 * marked "Example": rewards, prices and commissions are admin settings, and a
 * mock must not read as a quote.
 */

/** A platform's logo, or a monogram when the icon set has no mark for it. */
export function PlatformMark({ brand, label, className = "h-4 w-4" }: { brand: string; label: string; className?: string }) {
  const icon = BrandIcon({ brand, className });
  if (icon) return icon;
  return (
    <span
      aria-hidden
      className={`inline-grid place-items-center rounded-[0.3rem] border border-current text-[0.55rem] font-bold leading-none ${className}`}
    >
      {label.charAt(0)}
    </span>
  );
}

function Pts({ children }: { children: ReactNode }) {
  return <span className="mkx-figure text-sm! tracking-tight text-(--mk-success)!">{children}</span>;
}

/* ─────────────────────────────── Micro-tasks ─────────────────────────────── */

const TASKS = [
  { brand: "youtube", label: "YouTube", title: "Watch a product review and leave a comment", time: "4 min", pts: "+60" },
  { brand: "facebook", label: "Facebook", title: "Follow a local bakery's page", time: "1 min", pts: "+25" },
  { brand: "survey", label: "Survey", title: "8 questions about how you shop online", time: "5 min", pts: "+80" },
  { brand: "googleplay", label: "Google Play", title: "Install a budgeting app and finish setup", time: "6 min", pts: "+120" },
];

export function MicrotaskMock() {
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Tasks · Available to you" tag="Example">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-(--mk-text)">Today</p>
          <div className="flex gap-1.5">
            <Chip>All</Chip>
            <Chip>Social</Chip>
            <Chip>Surveys</Chip>
          </div>
        </div>
        <ul className="divide-y divide-(--mk-border) rounded-xl border border-(--mk-border)">
          {TASKS.map((t) => (
            <li key={t.title} className="flex items-center gap-3 px-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-(--mk-border) bg-(--mk-surface-2) text-(--mk-text)">
                {t.brand === "survey" ? <ClipboardList className="h-4 w-4" aria-hidden /> : <PlatformMark brand={t.brand} label={t.label} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-(--mk-text)">{t.title}</p>
                <p className="text-[11px] text-(--mk-subtle)">
                  {t.label} · {t.time}
                </p>
              </div>
              <Pts>{t.pts}</Pts>
            </li>
          ))}
        </ul>
        <div className="h-8 sm:h-10" aria-hidden />
      </Window>

      {/* The moment the page is about: a link checked and approved. */}
      <div className="mkx-float relative -mt-6 ml-auto mr-3 w-64 sm:absolute sm:-bottom-10 sm:-left-8 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="mkx-live h-2 w-2 rounded-full bg-(--mk-success)" />
            <p className="text-xs font-semibold text-(--mk-text)">Proof checked</p>
            <span className="ml-auto">
              <Chip tone="ok">Approved</Chip>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-(--mk-subtle)">
            Link opened and matched 1/1 · 60 points added to your wallet
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Advertise ──────────────────────────────── */

const CLICKS = [38, 52, 47, 61, 58, 74, 69];

export function AdvertiseMock() {
  const max = Math.max(...CLICKS);
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Ad Manager · Campaigns" tag="Example">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-(--mk-text)">Spring launch — feed + wallet</p>
            <p className="mt-0.5 text-[11px] text-(--mk-subtle)">Cost per click · 2 spaces</p>
          </div>
          <Chip tone="ok">
            <span className="mkx-live h-1.5 w-1.5 rounded-full bg-(--mk-success)" /> Live
          </Chip>
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-(--mk-border) rounded-xl border border-(--mk-border)">
          {[
            ["Impressions", "18.4k"],
            ["Clicks", "399"],
            ["Spent", "$47.88"],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2.5">
              <dt className="text-[10px] text-(--mk-subtle)">{k}</dt>
              <dd className="mkx-figure mt-1 text-base!">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-xl border border-(--mk-border) p-3">
          <div className="flex items-center justify-between text-[11px] text-(--mk-subtle)">
            <span>Clicks · last 7 days</span>
            <span>Daily cap $10</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-2" aria-hidden>
            {CLICKS.map((c, i) => (
              <div key={i} className="flex h-full flex-1 items-end">
                <div
                  className="mkx-fill w-full origin-bottom! rounded-t-[4px] bg-(--mk-accent)/80"
                  style={{ height: `${(c / max) * 100}%`, animationName: "mkx-grow-y", animationDelay: `${0.4 + i * 0.07}s` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-(--mk-subtle)">
            <span>Budget used</span>
            <span>$47.88 of $120</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--mk-surface-2)">
            <div className="mkx-fill h-full w-[40%] rounded-full bg-(--mk-accent)" />
          </div>
        </div>
        {/* Room for the floating card that overlaps the window on wider screens. */}
        <div className="hidden h-10 sm:block" aria-hidden />
      </Window>

      <div className="mkx-float relative -mt-5 ml-auto mr-3 w-60 sm:absolute sm:-bottom-8 sm:-left-8 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-(--mk-text)">Creative reviewed</p>
            <span className="ml-auto">
              <Chip tone="ok">Approved</Chip>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-(--mk-subtle)">Checked by our team before it can serve.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Marketplace ─────────────────────────────── */

/** A listing's cover, drawn: a few blocks that read as a template preview. */
function Cover() {
  return (
    <div aria-hidden className="relative h-36 overflow-hidden rounded-xl border border-(--mk-border) bg-(--mk-surface-2) p-3 sm:h-40">
      <div className="grid h-full grid-cols-3 gap-2">
        <div className="col-span-2 flex flex-col gap-2 rounded-lg border border-(--mk-border) bg-(--mk-surface) p-2.5">
          <div className="h-2 w-1/2 rounded-full bg-(--mk-text)/70" />
          <div className="h-1.5 w-3/4 rounded-full bg-(--mk-border-strong)" />
          <div className="h-1.5 w-2/3 rounded-full bg-(--mk-border-strong)" />
          <div className="mt-auto flex gap-1.5">
            <div className="h-5 w-12 rounded-md bg-(--mk-accent)" />
            <div className="h-5 w-10 rounded-md border border-(--mk-border-strong)" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex-1 rounded-lg bg-(--mk-accent)/25" />
          <div className="flex-1 rounded-lg bg-(--mk-accent)/10" />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceMock() {
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Marketplace · Templates" tag="Example">
        <Cover />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-(--mk-text)">Landing page UI kit — 24 screens</p>
            <p className="mt-0.5 text-[11px] text-(--mk-subtle)">by Nadia Studio · Graphics &amp; templates</p>
          </div>
          <p className="mkx-figure text-xl!">$18</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone="ok">Reviewed</Chip>
          <Chip>Instant download</Chip>
          <Chip>Affiliate reward on</Chip>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="grid h-10 place-items-center rounded-full bg-(--mk-cta) text-sm font-semibold text-(--mk-on-cta)">Buy now</span>
          <span className="grid h-10 place-items-center rounded-full border border-(--mk-border-strong) text-sm font-semibold text-(--mk-text)">Preview</span>
        </div>
        {/* Room for the floating card that overlaps the window on wider screens. */}
        <div className="hidden h-10 sm:block" aria-hidden />
      </Window>

      <div className="mkx-float relative -mt-5 ml-auto mr-3 w-64 sm:absolute sm:-bottom-16 sm:-left-10 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <p className="text-xs font-semibold text-(--mk-text)">Logo design · in escrow</p>
          <ol className="mt-2.5 flex items-center gap-1.5 text-[10px] text-(--mk-subtle)">
            {["Paid", "Delivered", "Released"].map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1">
                <span className={`h-1 rounded-full ${i < 2 ? "bg-(--mk-success)" : "bg-(--mk-border-strong)"}`} />
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] leading-snug text-(--mk-subtle)">Held until the buyer confirms delivery.</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────── Courses ───────────────────────────────── */

const LESSONS = [
  { t: "Finding your first clients", d: "8:12", done: true },
  { t: "Pricing a project", d: "11:40", done: true },
  { t: "Writing a proposal that wins", d: "9:05", now: true },
  { t: "Quiz · Proposals", d: "5 Qs" },
];

export function CoursesMock() {
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Freelancing Foundations · Lesson 3" tag="Example">
        <div aria-hidden className="relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-[#06140e]">
          <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_30%_20%,rgba(16,185,129,0.35),transparent_60%)]" />
          <span className="relative grid h-12 w-12 place-items-center rounded-full bg-white/95 text-[#06140e] shadow-lg">
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
          </span>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className="mkx-fill h-full w-[38%] rounded-full bg-white" />
            </div>
            <span className="text-[10px] text-white/80">3:27 / 9:05</span>
          </div>
        </div>
        <ul className="mt-4 space-y-1">
          {LESSONS.map((l) => (
            <li
              key={l.t}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] ${l.now ? "bg-(--mk-accent)/10" : ""}`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                  l.done ? "border-(--mk-success) bg-(--mk-success) text-(--mk-bg)" : "border-(--mk-border-strong)"
                }`}
              >
                {l.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={`flex-1 truncate ${l.now ? "font-semibold text-(--mk-text)" : "text-(--mk-muted)"}`}>{l.t}</span>
              <span className="text-[11px] text-(--mk-subtle)">{l.d}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-3 border-t border-(--mk-border) pt-3 text-[11px] text-(--mk-subtle)">
          <span>Course progress</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--mk-surface-2)">
            <div className="mkx-fill h-full w-[46%] rounded-full bg-(--mk-accent)" />
          </div>
          <span>46%</span>
        </div>
        {/* Room for the floating card that overlaps the window on wider screens. */}
        <div className="hidden h-10 sm:block" aria-hidden />
      </Window>

      <div className="mkx-float relative -mt-5 ml-auto mr-3 w-60 sm:absolute sm:-bottom-10 sm:-left-10 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-(--mk-border) text-(--mk-accent)">
              <Award className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold text-(--mk-text)">Certificate of completion</p>
              <p className="text-[11px] text-(--mk-subtle)">Shareable on your profile</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Affiliate ──────────────────────────────── */

const SALES = [
  { item: "Landing page UI kit", via: "Instagram bio", amt: "+$2.70" },
  { item: "Freelancing Foundations", via: "YouTube description", amt: "+$4.50" },
  { item: "Invoice template pack", via: "WhatsApp group", amt: "+$1.20" },
];

export function AffiliateMock() {
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Affiliate · Your links" tag="Example">
        <p className="text-[11px] text-(--mk-subtle)">Your link for “Landing page UI kit”</p>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-(--mk-border) bg-(--mk-surface-2) p-1.5 pl-3">
          <Link2 aria-hidden className="h-4 w-4 shrink-0 text-(--mk-subtle)" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-(--mk-text)">revtype.com/m/ui-kit?ref=amina</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-(--mk-cta) px-2.5 py-1.5 text-[11px] font-semibold text-(--mk-on-cta)">
            <Copy aria-hidden className="h-3 w-3" /> Copy
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-(--mk-border) rounded-xl border border-(--mk-border)">
          {[
            ["Clicks", "1,284"],
            ["Sales", "37"],
            ["Earned", "$96.40"],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2.5">
              <dt className="text-[10px] text-(--mk-subtle)">{k}</dt>
              <dd className="mkx-figure mt-1 text-base!">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] font-semibold text-(--mk-subtle)">Recent commissions</p>
        <ul className="mt-1.5 divide-y divide-(--mk-border)">
          {SALES.map((s) => (
            <li key={s.item} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-(--mk-text)">{s.item}</p>
                <p className="text-[11px] text-(--mk-subtle)">via {s.via}</p>
              </div>
              <Pts>{s.amt}</Pts>
            </li>
          ))}
        </ul>
        {/* Room for the floating card that overlaps the window on wider screens. */}
        <div className="hidden h-10 sm:block" aria-hidden />
      </Window>

      <div className="mkx-float relative -mt-5 ml-auto mr-3 w-56 sm:absolute sm:-bottom-8 sm:-left-10 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="mkx-live h-2 w-2 rounded-full bg-(--mk-success)" />
            <p className="text-xs font-semibold text-(--mk-text)">New sale through your link</p>
          </div>
          <p className="mt-1.5 text-[11px] text-(--mk-subtle)">Commission added to your wallet</p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Programs ───────────────────────────────── */

export function ProgramsMock({ programs }: { programs: string[] }) {
  const reqs = [
    { t: "Profile at least 80% complete", ok: true },
    { t: "Account level 2 or higher", ok: true },
    { t: "Identity verified", ok: false },
  ];
  return (
    <div className="relative mx-auto max-w-lg lg:mr-0">
      <Window title="Applications" tag="Example">
        <p className="text-[11px] text-(--mk-subtle)">Choose a program</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {programs.slice(0, 7).map((p, i) => (
            <span
              key={p}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                i === 0 ? "border-(--mk-accent) bg-(--mk-accent)/10 text-(--mk-accent)" : "border-(--mk-border) text-(--mk-muted)"
              }`}
            >
              {p}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-(--mk-border) p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-(--mk-text)">{programs[0]}</p>
            <span className="text-[11px] text-(--mk-subtle)">2 of 3 met</span>
          </div>
          <ul className="mt-3 space-y-2">
            {reqs.map((r) => (
              <li key={r.t} className="flex items-center gap-2.5 text-[13px]">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    r.ok ? "border-(--mk-success) bg-(--mk-success) text-(--mk-bg)" : "border-(--mk-border-strong)"
                  }`}
                >
                  {r.ok && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className={r.ok ? "text-(--mk-muted)" : "text-(--mk-text)"}>{r.t}</span>
                {!r.ok && <span className="ml-auto text-[11px] font-semibold text-(--mk-accent)">Finish →</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-(--mk-surface-2)">
            <div className="mkx-fill h-full w-2/3 rounded-full bg-(--mk-accent)" />
          </div>
        </div>
        {/* Room for the floating card that overlaps the window on wider screens. */}
        <div className="hidden h-10 sm:block" aria-hidden />
      </Window>

      <div className="mkx-float relative -mt-5 ml-auto mr-3 w-60 sm:absolute sm:-bottom-8 sm:-left-10 sm:m-0">
        <div className="mk-panel p-3.5 shadow-xl">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-(--mk-text)">Application sent</p>
            <span className="ml-auto">
              <Chip tone="wait">In review</Chip>
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-(--mk-subtle)">You&apos;ll get the decision by email.</p>
        </div>
      </div>
    </div>
  );
}
