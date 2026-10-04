import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, ArrowLeft } from "lucide-react";
import { Section, PrimaryButton } from "@/components/marketing/ui";
import { getArticle, getArticles, formatArticleDate, withTableOfContents } from "@/lib/blog";
import { mediaSrc } from "@/lib/media-url";
import { pageMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY_NAME } from "@/config/company";
import { OFFER_RICHTEXT_CLASS } from "@/lib/offers";
import { ArticleViewBeacon } from "./view-beacon";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

// Rebuilt in the background at most every five minutes, and at once when the
// article is saved at /admin/blog.
export const revalidate = 300;

export async function generateStaticParams() {
  return (await getArticles()).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await getArticle((await params).slug);
  if (!a) return { title: { absolute: "Article not found · RevType" }, robots: { index: false, follow: true } };
  return pageMeta({
    title: a.metaTitle || a.title,
    description: a.metaDescription || a.excerpt,
    path: `/blog/${a.slug}`,
    type: "article",
    publishedTime: a.publishedAt,
    modifiedTime: a.updatedAt,
    authors: [a.author],
    // The cover cropped to 1200×630; no cover → the site share image.
    image: a.coverImage || undefined,
    imageAlt: a.coverAlt || a.title,
    noindex: a.noindex,
    canonical: a.canonicalUrl ?? undefined,
    keywords: [a.focusKeyword, ...a.tags].filter((k): k is string => !!k),
  });
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getArticle((await params).slug);
  if (!post) notFound();

  const all = await getArticles();
  // Same category first, then the newest of the rest.
  const more = [
    ...all.filter((p) => p.slug !== post.slug && p.category === post.category),
    ...all.filter((p) => p.slug !== post.slug && p.category !== post.category),
  ].slice(0, 3);

  const { html, toc } = withTableOfContents(post.html);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = post.coverImage ? new URL(mediaSrc(post.coverImage), SITE_URL).toString() : `${SITE_URL}/icon-512.png`;

  return (
    <Section width="narrow">
      <ArticleViewBeacon slug={post.slug} />
      {/* Article + breadcrumb structured data: who wrote it, who publishes
          it, and when — the signals search and AI answers weigh (E-E-A-T). */}
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.metaTitle || post.title,
            description: post.metaDescription || post.excerpt,
            image,
            articleSection: post.category,
            keywords: [post.focusKeyword, ...post.tags].filter(Boolean).join(", ") || undefined,
            datePublished: post.publishedAt,
            dateModified: post.updatedAt,
            timeRequired: `PT${post.readMinutes}M`,
            inLanguage: "en",
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
            url,
            author: { "@type": "Organization", name: post.author || `The ${COMPANY_NAME} Team`, url: `${SITE_URL}/about` },
            publisher: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: COMPANY_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
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

      {post.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaSrc(post.coverImage)}
          alt={post.coverAlt || post.title}
          className="mt-6 w-full max-h-105 rounded-3xl object-cover"
          fetchPriority="high"
        />
      ) : (
        <div className="mt-6 grid place-items-center rounded-3xl bg-linear-to-br from-(--mk-grad-a)/20 to-(--mk-rail-b)/20 py-14 text-7xl">
          {post.emoji ?? "📝"}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-(--mk-muted)">
        <span className="rounded-full bg-blue-500/10 border border-blue-500/30 text-(--mk-accent) px-2.5 py-1 font-semibold uppercase tracking-wider">{post.category}</span>
        <time dateTime={post.publishedAt}>{formatArticleDate(post.publishedAt)}</time>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{post.readMinutes} min read</span>
      </div>

      <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-(--mk-text) tracking-tight wrap-break-word">{post.title}</h1>
      <p className="mt-2 text-sm text-(--mk-subtle)">
        By {post.author}
        {post.updatedAt.slice(0, 10) !== post.publishedAt.slice(0, 10) && (
          <> · Updated <time dateTime={post.updatedAt}>{formatArticleDate(post.updatedAt)}</time></>
        )}
      </p>

      {toc.length >= 3 && (
        <nav aria-label="In this article" className="mt-8 rounded-2xl mk-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-(--mk-subtle)">In this article</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {toc.map((h) => (
              <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
                <a href={`#${h.id}`} className="text-(--mk-muted) hover:text-(--mk-accent)">{h.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <article
        className={`mt-8 ${OFFER_RICHTEXT_CLASS} text-[15px] text-(--mk-text)! [&_h2]:text-(--mk-text)! [&_h3]:text-(--mk-text)! [&_h4]:text-(--mk-text)! [&_strong]:text-(--mk-text)! [&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24 [&_p]:leading-relaxed`}
        // Sanitised in lib/blog.ts (lib/rich-html.ts) before it gets here.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <span key={t} className="rounded-full mk-card px-3 py-1 text-xs text-(--mk-muted)">#{t}</span>
          ))}
        </div>
      )}

      <div className="mt-10 rounded-2xl mk-card p-6 text-center">
        <h2 className="text-lg font-bold text-(--mk-text)">Start earning today</h2>
        <p className="mt-1 text-sm text-(--mk-muted)">Create a free account and put this into practice.</p>
        <div className="mt-4 flex justify-center"><PrimaryButton href="/register">Get started free</PrimaryButton></div>
      </div>

      {more.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-(--mk-subtle) mb-3">More articles</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {more.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-xl mk-card p-4 hover:border-blue-500/30 transition-all">
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(p.coverImage)} alt={p.coverAlt || p.title} loading="lazy" className="h-24 w-full rounded-lg object-cover" />
                ) : (
                  <div className="text-3xl">{p.emoji ?? "📝"}</div>
                )}
                <p className="mt-2 text-sm font-semibold text-(--mk-text) leading-snug">{p.title}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
