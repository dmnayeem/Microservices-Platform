import Link from "next/link";
import { ArrowRight, Coins, GraduationCap, Megaphone, ShoppingBag, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";
import type { AudiencesContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

const ICONS: Record<string, LucideIcon> = { Coins, ShoppingBag, Megaphone, GraduationCap, Users, Wallet, Sparkles };
/** One colour per card, so the three ways read as three different things. */
const TONES = [
  // Text on the soft fills uses theme tokens (contrast-checked in both themes).
  { tile: "from-emerald-500 to-teal-600", ring: "border-emerald-500/30", soft: "bg-(--mk-success)/10 text-(--mk-success)" },
  { tile: "from-sky-500 to-indigo-600", ring: "border-sky-500/30", soft: "bg-(--mk-info)/10 text-(--mk-info)" },
  { tile: "from-amber-500 to-orange-600", ring: "border-amber-500/30", soft: "bg-(--mk-coin)/10 text-(--mk-coin-text)" },
];

type Props = Partial<AudiencesContent>;

/**
 * "Who it's for": what the platform is, in three cards — what each kind of
 * visitor does here and what they get. Right under the hero, so the first
 * scroll answers "what is this and what would I do here?".
 */
export function Audiences(props: Props) {
  const v: AudiencesContent = { ...DEFAULT_LANDING_CONTENT.audiences, ...props };
  if (!v.items?.length) return null;
  return (
    <section id="who-its-for" className="mk-section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={v.badge} line1={v.heading_line1} line2={v.heading_line2} sub={v.subheading} />
        <div className="mk-rise grid gap-5 md:grid-cols-3">
          {v.items.map((it, i) => {
            const Icon = ICONS[it.iconKey] ?? Sparkles;
            const t = TONES[i % TONES.length];
            return (
              <div key={i} className={`mk-card flex flex-col rounded-2xl border p-5 sm:p-6 ${t.ring}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-linear-to-br text-white shadow-sm ${t.tile}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="mk-h3 text-(--mk-text)">{it.title}</h3>
                    <p className="text-sm text-(--mk-subtle)">{it.who}</p>
                  </div>
                </div>
                <ol className="mt-5 space-y-2.5">
                  {it.does.filter(Boolean).map((d, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-(--mk-muted)">
                      <span className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${t.soft}`}>
                        {j + 1}
                      </span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ol>
                {it.gets && (
                  <p className={`mt-5 rounded-xl px-3.5 py-2.5 text-sm font-medium ${t.soft}`}>
                    <span className="font-bold">You get: </span>
                    {it.gets}
                  </p>
                )}
                <div className="mt-auto pt-5">
                  <Link
                    href={it.cta_href || "/register"}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-(--mk-accent) hover:underline"
                  >
                    {it.cta_label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
