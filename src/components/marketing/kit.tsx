import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * Marketing kit — the editorial skin of the public feature pages (/microtask,
 * /advertise, /features/*, /programs).
 *
 * The older primitives in ./ui.tsx drew every page out of the same three
 * moves: a centred pill badge over a two-tone headline, a grid of identical
 * icon-in-a-tinted-square cards, and a gradient band. That pattern is what
 * made the pages read as generated. This kit is the opposite set of habits:
 *  - left-aligned, split headings (title one side, the sentence that earns it
 *    the other), no pill badges, no gradient-clipped text;
 *  - content laid out by what it is — hairline rows for a list, a numbered
 *    rail for steps, one row of figures for facts — instead of a card each;
 *  - a real product surface in the hero, rebuilt in markup so it themes;
 *  - motion that is quiet and earned: entrances, a hover line, a marquee —
 *    all gated on the admin's animation switch and on reduced motion.
 * Styles live in globals.css under "Marketing kit (mkx)".
 */

export function PageHero({
  kicker,
  title,
  accent,
  lead,
  actions,
  note,
  visual,
}: {
  kicker: string;
  title: string;
  /** Second line, set in the muted ink — the quieter half of the headline. */
  accent?: string;
  lead: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-(--mk-border)">
      <div aria-hidden className="mkx-grid-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-14 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="mkx-enter min-w-0">
          <p className="mkx-kicker">{kicker}</p>
          <h1 className="mkx-display mt-5 text-(--mk-text)">
            {title}
            {accent && <span className="block text-(--mk-subtle)">{accent}</span>}
          </h1>
          <p className="mkx-lead mt-6 max-w-xl">{lead}</p>
          {actions && <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div>}
          {note && <p className="mt-6 text-sm text-(--mk-subtle)">{note}</p>}
        </div>
        {visual && <div className="mkx-enter mkx-delay-2 relative min-w-0">{visual}</div>}
      </div>
    </section>
  );
}

/** A page section. `alt` sits on the band colour, framed by hairlines. */
export function Band({
  id,
  labelledBy,
  alt,
  children,
  className = "",
}: {
  id?: string;
  labelledBy?: string;
  alt?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`mkx-band scroll-mt-24 ${alt ? "border-y border-(--mk-border) bg-(--mk-band)" : ""} ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

/** Split heading: index + label + title on the left, the lead on the right. */
export function SectionHead({
  id,
  n,
  label,
  title,
  lead,
}: {
  /** id for the h2 — pass the same value as the Band's `labelledBy`. */
  id: string;
  n?: string;
  label?: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <div className="mkx-head mkx-reveal grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-10">
      <div className="lg:col-span-7">
        {label && (
          <p className="mkx-label">
            {n && <span className="mkx-num">{n}</span>}
            {label}
          </p>
        )}
        <h2 id={id} className="mkx-h2 mt-4">
          {title}
        </h2>
      </div>
      {lead && <p className="mkx-lead lg:col-span-5">{lead}</p>}
    </div>
  );
}

/** Key figures in one ruled row — two columns on a phone, four from lg. */
export function Facts({ items }: { items: Array<{ value: string; label: string }> }) {
  return (
    <dl className="grid grid-cols-2 border-y border-(--mk-border) lg:grid-cols-4">
      {items.map((f, i) => (
        <div
          key={f.label}
          className={[
            "mkx-reveal flex flex-col gap-2 px-4 py-6 sm:px-6 sm:py-8",
            i % 2 === 1 ? "border-l border-(--mk-border)" : "",
            i >= 2 ? "border-t border-(--mk-border) lg:border-t-0" : "",
            // The first column sits flush with the page edge; on a desktop the
            // third item is no longer first in its row.
            i % 2 === 0 ? "pl-0!" : "",
            i === 2 ? "lg:border-l lg:pl-6!" : "",
          ].join(" ")}
        >
          <dt className="text-sm text-(--mk-subtle)">{f.label}</dt>
          {/* Value first on screen, label first in the markup (dt before dd). */}
          <dd className="mkx-figure order-first">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Hairline rows — the list layout for things that are read, not scanned. */
export function Rows({
  items,
}: {
  items: Array<{ title: string; body: ReactNode; meta?: ReactNode; icon?: ReactNode }>;
}) {
  return (
    <ul className="border-t border-(--mk-border)">
      {items.map((it, i) => (
        <li
          key={it.title}
          className="mkx-row mkx-reveal grid gap-2 border-b border-(--mk-border) py-6 sm:grid-cols-12 sm:gap-8 sm:py-7"
        >
          <div className="flex items-baseline gap-4 sm:col-span-4">
            <span className="mkx-num w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mkx-h3 flex items-center gap-2.5">
              {it.icon && <span className="text-(--mk-accent) [&_svg]:h-4 [&_svg]:w-4">{it.icon}</span>}
              {it.title}
            </h3>
          </div>
          <p className="mkx-body pl-10 sm:col-span-8 sm:pl-0 lg:col-span-6">{it.body}</p>
          {it.meta && (
            // Tablet: under the body text. Desktop: its own right-hand column.
            <div className="pl-10 text-sm text-(--mk-subtle) sm:col-span-8 sm:col-start-5 sm:pl-0 lg:col-span-2 lg:col-start-auto lg:text-right">
              {it.meta}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps on a rail — four across on a desktop, stacked on a phone. */
export function Steps({
  items,
  prefix = "Step ",
}: {
  items: Array<{ title: string; body: ReactNode }>;
  /** Marker before the number; "" gives a plain 01, 02… for lists that are not a sequence. */
  prefix?: string;
}) {
  const cols = items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <ol className={`grid gap-x-6 gap-y-10 sm:grid-cols-2 ${cols}`}>
      {items.map((s, i) => (
        <li key={s.title} className="mkx-step mkx-reveal">
          <span className="mkx-num">{prefix ? `${prefix}${i + 1}` : String(i + 1).padStart(2, "0")}</span>
          <h3 className="mkx-h3 mt-3">{s.title}</h3>
          <p className="mkx-body mt-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** A content tile for bento grids. `visual` sits above the text. */
export function Tile({
  title,
  body,
  visual,
  href,
  cta,
  className = "",
}: {
  title: string;
  body: ReactNode;
  visual?: ReactNode;
  href?: string;
  cta?: string;
  className?: string;
}) {
  const inner = (
    <>
      {visual && <div className="mb-6">{visual}</div>}
      <h3 className="mkx-h3">{title}</h3>
      <p className="mkx-body mt-2">{body}</p>
      {href && cta && (
        <span className="mkx-arrow mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent)">
          {cta} <ArrowRight aria-hidden className="h-4 w-4" />
        </span>
      )}
    </>
  );
  const cls = `mkx-tile mkx-reveal mk-card flex flex-col rounded-2xl p-6 sm:p-7 ${className}`;
  return href ? (
    <Link href={href} className={`${cls} mk-focus`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Btn({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "light" | "outline-light";
}) {
  const v = {
    primary: "bg-(--mk-cta) text-(--mk-on-cta) hover:brightness-110",
    secondary: "border border-(--mk-border-strong) bg-(--mk-surface) text-(--mk-text) hover:border-(--mk-text)/40",
    light: "bg-white text-[#05301f] hover:bg-white/90",
    "outline-light": "border border-white/35 text-white hover:bg-white/10",
  }[variant];
  return (
    <Link
      href={href}
      className={`mk-press mkx-arrow inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[0.9375rem] font-semibold ${v}`}
    >
      {children}
      {(variant === "primary" || variant === "light") && <ArrowRight aria-hidden className="h-4 w-4" />}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mkx-arrow inline-flex items-center gap-1.5 font-semibold text-(--mk-accent) underline-offset-4 hover:underline"
    >
      {children} <ArrowRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}

/**
 * Questions and answers, as native <details> (works with no JavaScript and is
 * read by search engines whether open or not), plus their FAQPage data.
 */
export function Faq({ id, items }: { id: string; items: Array<{ q: string; a: string }> }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="mkx-reveal lg:col-span-4">
          <p className="mkx-label">Questions</p>
          <h2 id={id} className="mkx-h2 mt-4">
            Before you start
          </h2>
          <p className="mkx-body mt-4">
            More answers in the{" "}
            <Link href="/help" className="font-semibold text-(--mk-accent) underline-offset-4 hover:underline">
              Help Center
            </Link>
            .
          </p>
        </div>
        <div className="border-t border-(--mk-border) lg:col-span-8">
          {items.map((f) => (
            <details key={f.q} className="mkx-faq group border-b border-(--mk-border)">
              <summary className="mk-focus flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-left">
                <span className="mkx-h3">{f.q}</span>
                <span
                  aria-hidden
                  className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-(--mk-border-strong) text-(--mk-subtle) transition-transform duration-300 group-open:rotate-45"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </span>
              </summary>
              <p className="mkx-body max-w-2xl pb-6 pr-10">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}

/** The closing band: a statement on the left, the two actions on the right. */
export function Closing({
  title,
  lead,
  primary,
  secondary,
}: {
  title: string;
  lead?: ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="mkx-band pt-0!">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mkx-closing mkx-reveal relative overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-16">
          <div className="relative grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2 className="mkx-h2 text-white!">{title}</h2>
              {lead && <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">{lead}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:col-span-5 lg:justify-end">
              <Btn href={primary.href} variant="light">
                {primary.label}
              </Btn>
              {secondary && (
                <Btn href={secondary.href} variant="outline-light">
                  {secondary.label}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Frame for a product mock: a window with a title bar. */
export function Window({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mk-panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-(--mk-border) bg-(--mk-surface-2) px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-(--mk-border-strong)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--mk-border-strong)" />
          <span className="h-2.5 w-2.5 rounded-full bg-(--mk-border-strong)" />
        </div>
        <p className="truncate text-xs font-medium text-(--mk-subtle)">{title}</p>
        {tag ? (
          <span className="rounded-full border border-(--mk-border) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-(--mk-subtle)">
            {tag}
          </span>
        ) : (
          <span className="w-10" />
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Small status chip used inside mocks. */
export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "ok" | "wait" }) {
  const t = {
    plain: "border-(--mk-border) text-(--mk-muted)",
    ok: "border-(--mk-success)/30 bg-(--mk-success)/10 text-(--mk-success)",
    wait: "mkx-chip-wait",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t}`}>
      {children}
    </span>
  );
}

/** Endless horizontal strip. Children are rendered twice; the copy is hidden from assistive tech. */
export function Marquee({ children, seconds = 60 }: { children: ReactNode; seconds?: number }) {
  return (
    <div className="mkx-marquee" style={{ ["--mkx-dur" as string]: `${seconds}s` }}>
      <div className="mkx-marquee-track">
        <div className="flex shrink-0 gap-3">{children}</div>
        <div className="flex shrink-0 gap-3" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
