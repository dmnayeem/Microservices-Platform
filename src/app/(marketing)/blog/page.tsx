import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { MarketingHero, Section } from "@/components/marketing/ui";
import { BLOG_POSTS, formatBlogDate } from "@/lib/blog-posts";
import { COMPANY_NAME } from "@/config/company";

export const metadata: Metadata = {
  title: "Blog",
  description: `Guides, tips, and stories from ${COMPANY_NAME} on earning online safely and getting the most from the platform.`,
};

export default function BlogIndexPage() {
  const [featured, ...rest] = BLOG_POSTS;
  return (
    <>
      <MarketingHero
        badge="Blog"
        title="Ideas, guides &"
        highlight="honest advice"
        subtitle="Practical, no-hype writing on earning online, staying safe, and making the most of your time."
      />

      <Section>
        {/* Featured */}
        <Link
          href={`/blog/${featured.slug}`}
          className="group block rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl overflow-hidden hover:border-blue-500/30 transition-all"
        >
          <div className="grid md:grid-cols-2">
            <div className="grid place-items-center bg-linear-to-br from-blue-500/20 to-purple-600/20 p-12 text-7xl">
              {featured.emoji}
            </div>
            <div className="p-6 sm:p-10">
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2.5 py-1 font-semibold uppercase tracking-wider">{featured.category}</span>
                <span>{formatBlogDate(featured.date)}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{featured.readMinutes} min</span>
              </div>
              <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold text-white">{featured.title}</h2>
              <p className="mt-3 text-slate-400 leading-relaxed">{featured.excerpt}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue-400">
                Read article <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </Link>

        {/* Grid */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group flex flex-col rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl overflow-hidden hover:border-blue-500/30 transition-all"
            >
              <div className="grid place-items-center bg-linear-to-br from-blue-500/15 to-purple-600/15 py-10 text-5xl">{p.emoji}</div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5">{p.category}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{p.readMinutes} min</span>
                </div>
                <h3 className="mt-3 font-bold text-white leading-snug">{p.title}</h3>
                <p className="mt-2 text-sm text-slate-400 line-clamp-3">{p.excerpt}</p>
                <span className="mt-4 text-xs text-slate-500">{formatBlogDate(p.date)}</span>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
