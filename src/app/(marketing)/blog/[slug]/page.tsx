import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ArrowLeft } from "lucide-react";
import { Section, PrimaryButton } from "@/components/marketing/ui";
import { BLOG_POSTS, getBlogPost, formatBlogDate } from "@/lib/blog-posts";
import { pageMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY_NAME } from "@/config/company";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  if (!post) return { title: "Article" };
  return pageMeta({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    type: "article",
    publishedTime: post.date,
    modifiedTime: post.date,
    authors: [post.author],
  });
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();

  const more = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  const url = `${SITE_URL}/blog/${post.slug}`;
  return (
    <Section width="narrow">
      {/* Article + breadcrumb structured data: who wrote it, who publishes
          it, and when — the signals search and AI answers weigh (E-E-A-T). */}
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            articleSection: post.category,
            datePublished: post.date,
            dateModified: post.date,
            timeRequired: `PT${post.readMinutes}M`,
            inLanguage: "en",
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            url,
            author: { "@type": "Organization", name: post.author || `The ${COMPANY_NAME} Team`, url: `${SITE_URL}/about` },
            publisher: { "@type": "Organization", name: COMPANY_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
              { "@type": "ListItem", position: 3, name: post.title, item: url },
            ],
          },
        ]}
      />
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-(--mk-muted) hover:text-(--mk-text)">
        <ArrowLeft className="h-4 w-4" /> All articles
      </Link>

      <div className="mt-6 grid place-items-center rounded-3xl bg-linear-to-br from-(--mk-grad-a)/20 to-(--mk-rail-b)/20 py-14 text-7xl">
        {post.emoji}
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-(--mk-muted)">
        <span className="rounded-full bg-blue-500/10 border border-blue-500/30 text-(--mk-accent) px-2.5 py-1 font-semibold uppercase tracking-wider">{post.category}</span>
        <span>{formatBlogDate(post.date)}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{post.readMinutes} min read</span>
      </div>

      <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-(--mk-text) tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-(--mk-subtle)">By {post.author}</p>

      <article className="mt-8 space-y-6">
        {post.body.map((b, i) => (
          <div key={i} className="space-y-3">
            {b.heading && <h2 className="text-xl font-bold text-(--mk-text)">{b.heading}</h2>}
            {b.paragraphs.map((p, j) => (
              <p key={j} className="text-[15px] leading-relaxed text-(--mk-text)">{p}</p>
            ))}
            {b.bullets && (
              <ul className="ml-5 list-disc space-y-1 text-[15px] text-(--mk-text)">
                {b.bullets.map((li, k) => <li key={k}>{li}</li>)}
              </ul>
            )}
          </div>
        ))}
      </article>

      <div className="mt-10 rounded-2xl mk-card p-6 text-center">
        <h3 className="text-lg font-bold text-(--mk-text)">Start earning today</h3>
        <p className="mt-1 text-sm text-(--mk-muted)">Create a free account and put this into practice.</p>
        <div className="mt-4 flex justify-center"><PrimaryButton href="/register">Get started free</PrimaryButton></div>
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-wider text-(--mk-subtle) mb-3">More articles</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {more.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-xl mk-card p-4 hover:border-blue-500/30 transition-all">
              <div className="text-3xl">{p.emoji}</div>
              <p className="mt-2 text-sm font-semibold text-(--mk-text) leading-snug">{p.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </Section>
  );
}
