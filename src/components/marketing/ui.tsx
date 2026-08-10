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
//   heading      text-slate-900         body        text-slate-600
//   muted        text-slate-500         card        bg-white border-slate-200 shadow-sm
//   eyebrow pill  bg-indigo-50 text-indigo-700 border-indigo-100
//   primary btn   bg-linear-to-r from-indigo-600 to-violet-600 text-white
//   accent text   from-indigo-600 to-violet-600 bg-clip-text
//   money/success text-emerald-600

export function BadgePill({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "purple" | "cyan" | "emerald";
}) {
  const tones: Record<string, string> = {
    blue: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600",
    purple: "bg-violet-500/10 border-violet-500/20 text-violet-600",
    cyan: "bg-sky-500/10 border-sky-500/20 text-sky-600",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
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
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-indigo-500/10 to-transparent"
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
                <span className="bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
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
          <p className="text-3xl sm:text-4xl font-extrabold bg-linear-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
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
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-600/20 hover:from-indigo-500 hover:to-violet-500 transition-colors"
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
