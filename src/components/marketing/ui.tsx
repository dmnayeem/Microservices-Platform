import Link from "next/link";
import type { ReactNode } from "react";

// Shared presentational primitives for the public marketing surface.
//
// Design language: a clean, light-forward professional look (white / slate-50
// section bands, crisp slate-900 type, soft-shadow white cards, restrained
// indigo→violet brand accents, emerald for money). This is the trust-first
// marketing skin — the in-app dashboard stays dark. Keep these primitives as
// the single source of the marketing palette so every page reads consistently.
//
// Palette cheat-sheet (reuse verbatim across marketing pages):
//   heading      text-(--mk-text)         body        text-(--mk-muted)
//   muted        text-(--mk-subtle)         card        bg-white border-(--mk-border) shadow-sm
//   eyebrow pill  bg-(--mk-accent-soft) text-(--mk-accent) border-(--mk-accent-soft-border)
//   primary btn   bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) text-white
//   accent text   from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text
//   money/success text-(--mk-success)
//
// grad-* is the SOLID pair: dark enough in both themes that white ink on it
// clears AA, so it is what fills buttons and bands. rail-* is the BRIGHT pair
// and flips per theme, so it is what paints on the page — clipped headlines,
// bars, small tiles. Using grad-* for text is the mistake this split prevents.

export function BadgePill({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "purple" | "cyan" | "emerald";
}) {
  // Four hues collapsed to two. The blue/purple/cyan variants were literal
  // 600-level text, which is readable on the light band and fails on the dark
  // one — so each page picked a badge that was legible in exactly one theme.
  // The brand is a single green now; `emerald` stays distinct because it means
  // money, not decoration. The prop is kept so call sites do not have to change.
  const brand = "bg-(--mk-accent)/10 border-(--mk-accent)/20 text-(--mk-accent)";
  const tones: Record<string, string> = {
    blue: brand,
    purple: brand,
    cyan: brand,
    emerald: "bg-(--mk-success)/10 border-(--mk-success)/25 text-(--mk-success)",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Page hero: badge + big headline (with gradient highlight) + subtitle, centered. */
export function MarketingHero({
  badge,
  title,
  highlight,
  subtitle,
}: {
  badge?: string;
  title: string;
  highlight?: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-(--mk-grad-a)/10 to-transparent"
      />
      <div className="relative pt-16 pb-10 sm:pt-24 sm:pb-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {badge && (
            <div className="mb-5">
              <BadgePill>{badge}</BadgePill>
            </div>
          )}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            {title}
            {highlight && (
              <>
                {" "}
                <span className="bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
                  {highlight}
                </span>
              </>
            )}
          </h1>
          {subtitle && (
            <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function Section({
  children,
  className = "",
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "narrow";
}) {
  const w = width === "narrow" ? "max-w-3xl" : "max-w-7xl";
  return (
    <section className={`py-14 sm:py-20 ${className}`}>
      <div className={`${w} mx-auto px-4 sm:px-6 lg:px-8`}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  badge,
  title,
  subtitle,
  tone,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  tone?: "blue" | "purple" | "cyan" | "emerald";
}) {
  return (
    <div className="text-center mb-12">
      {badge && (
        <div className="mb-4">
          <BadgePill tone={tone}>{badge}</BadgePill>
        </div>
      )}
      <h2 className="text-3xl sm:text-4xl font-extrabold text-(--mk-text) tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-(--mk-muted) max-w-2xl mx-auto leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/** White soft-shadow surface card — the standard marketing content container. */
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-(--mk-surface) border border-(--mk-border) shadow-sm p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/** Alias — semantically clearer name for the light surface card. */
export const SurfaceCard = GlassCard;

export function StatGrid({
  stats,
}: {
  stats: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <GlassCard key={s.label} className="text-center">
          <p className="text-3xl sm:text-4xl font-extrabold bg-linear-to-r from-(--mk-rail-a) to-(--mk-rail-b) bg-clip-text text-transparent">
            {s.value}
          </p>
          <p className="mt-1 text-sm text-(--mk-subtle)">{s.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}

/** Flag chips of the markets we operate in. */
export function CountryFlags({
  countries,
}: {
  countries: Array<{ name: string; flag: string }>;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {countries.map((c) => (
        <span
          key={c.name}
          className="inline-flex items-center gap-1.5 rounded-full bg-(--mk-surface) border border-(--mk-border) px-3 py-1.5 text-sm text-(--mk-text) shadow-sm"
        >
          <span className="text-base leading-none">{c.flag}</span>
          {c.name}
        </span>
      ))}
    </div>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) px-6 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-600/20 hover:from-(--mk-grad-a) hover:to-(--mk-grad-b) transition-colors"
    >
      {children}
    </Link>
  );
}

export function GhostButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-(--mk-border-strong) bg-(--mk-surface) px-6 py-3 text-sm font-semibold text-(--mk-text) hover:bg-(--mk-surface-2) transition-colors"
    >
      {children}
    </Link>
  );
}
