import Link from "next/link";
import type { ReactNode } from "react";

// Shared presentational primitives for the marketing pages — built from the
// exact landing design tokens (glass, gradients, badge pills) so every page is
// visually consistent and premium.

export function BadgePill({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "purple" | "cyan" | "emerald" }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    cyan: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  };
  return (
    <span className={`inline-block px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Page hero: badge + big gradient headline + subtitle, centered. */
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
    <section className="pt-16 pb-10 sm:pt-24 sm:pb-14">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {badge && <div className="mb-5"><BadgePill>{badge}</BadgePill></div>}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight">
          {title}
          {highlight && (
            <>
              {" "}
              <span className="bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {highlight}
              </span>
            </>
          )}
        </h1>
        {subtitle && (
          <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
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
    <section className={`py-12 sm:py-16 ${className}`}>
      <div className={`${w} mx-auto px-4 sm:px-6 lg:px-8`}>{children}</div>
    </section>
  );
}

export function SectionHeading({ badge, title, subtitle, tone }: { badge?: string; title: string; subtitle?: string; tone?: "blue" | "purple" | "cyan" | "emerald" }) {
  return (
    <div className="text-center mb-12">
      {badge && <div className="mb-4"><BadgePill tone={tone}>{badge}</BadgePill></div>}
      <h2 className="text-3xl sm:text-4xl font-extrabold text-white">{title}</h2>
      {subtitle && <p className="mt-4 text-slate-400 max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}

export function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

export function StatGrid({ stats }: { stats: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <GlassCard key={s.label} className="text-center">
          <p className="text-3xl sm:text-4xl font-extrabold bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {s.value}
          </p>
          <p className="mt-1 text-sm text-slate-400">{s.label}</p>
        </GlassCard>
      ))}
    </div>
  );
}

/** Flag chips of the markets we operate in. */
export function CountryFlags({ countries }: { countries: Array<{ name: string; flag: string }> }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {countries.map((c) => (
        <span
          key={c.name}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-slate-300"
        >
          <span className="text-base leading-none">{c.flag}</span>
          {c.name}
        </span>
      ))}
    </div>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-6 py-3 text-sm font-bold text-white hover:scale-105 transition-transform"
    >
      {children}
    </Link>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}
