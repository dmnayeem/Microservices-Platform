import Link from "next/link";
import { ArrowRight, Coins, GraduationCap, Megaphone, ShoppingBag, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";
import type { AudiencesContent } from "@/lib/landing-content";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landing-content";
import { SectionHeading } from "./section-heading";

const ICONS: Record<string, LucideIcon> = { Coins, ShoppingBag, Megaphone, GraduationCap, Users, Wallet, Sparkles };

type Props = Partial<AudiencesContent>;

/**
 * "Who it's for": what the platform is, in three columns — what each kind of
 * visitor does here and what they get. Right under the hero, so the first
 * scroll answers "what is this and what would I do here?".
 *
 * One ink for all three (they were green, blue and orange gradient tiles):
 * the columns are told apart by their titles, which is what a reader uses.
 */
export function Audiences(props: Props) {
  const v: AudiencesContent = { ...DEFAULT_LANDING_CONTENT.audiences, ...props };
  if (!v.items?.length) return null;
  return (
    <section id="who-its-for" className="mkx-band">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow={v.badge} line1={v.heading_line1} line2={v.heading_line2} sub={v.subheading} />
        <div className="grid gap-4 md:grid-cols-3">
          {v.items.map((it, i) => {
            const Icon = ICONS[it.iconKey] ?? Sparkles;
            return (
              <div key={i} className="mkx-tile mkx-reveal mk-card flex flex-col rounded-2xl p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="mkx-h3 text-lg!">{it.title}</h3>
                    <p className="mt-1 text-sm text-(--mk-subtle)">{it.who}</p>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-(--mk-border) bg-(--mk-surface-2) text-(--mk-accent)">
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                </div>
                <ol className="mt-6 space-y-3 border-t border-(--mk-border) pt-5">
                  {it.does.filter(Boolean).map((d, j) => (
                    <li key={j} className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-(--mk-muted)">
                      <span className="mkx-num mt-[0.2rem] w-5 shrink-0">{String(j + 1).padStart(2, "0")}</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ol>
                {it.gets && (
                  <p className="mt-6 border-l-2 border-(--mk-accent) pl-3.5 text-sm leading-relaxed text-(--mk-text)">
                    <span className="font-semibold">You get: </span>
                    {it.gets}
                  </p>
                )}
                <div className="mt-auto pt-6">
                  <Link
                    href={it.cta_href || "/register"}
                    className="mkx-arrow inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent) underline-offset-4 hover:underline"
                  >
                    {it.cta_label}
                    <ArrowRight aria-hidden className="h-4 w-4" />
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
