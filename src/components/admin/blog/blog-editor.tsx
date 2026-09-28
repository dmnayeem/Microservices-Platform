"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, ExternalLink, Save, Send, EyeOff, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { useMediaPicker } from "@/components/admin/shared/use-media-picker";
import { DateField } from "@/components/ui/date-field";
import {
  analyzeSeo,
  slugify,
  wordCount,
  META_DESC_MAX,
  META_TITLE_MAX,
} from "@/lib/blog-seo";

const RichTextEditor = dynamic(
  () => import("@/components/admin/offers/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="h-96 rounded-lg border border-slate-700 bg-slate-950 animate-pulse" /> }
);

export interface BlogPostInput {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  coverAlt: string | null;
  category: string | null;
  tags: string[];
  authorName: string | null;
  status: string;
  publishedAt: string | Date | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

const toLocalInput = (d: string | Date | null) => {
  if (!d) return "";
  const t = new Date(d);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function Box({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {right}
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function Label({ children, count, max }: { children: React.ReactNode; count?: number; max?: number }) {
  return (
    <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
      <span>{children}</span>
      {count !== undefined && max !== undefined && (
        <span className={cn("tabular-nums", count > max ? "text-red-400" : count > max * 0.9 ? "text-amber-400" : "text-slate-500")}>
          {count}/{max}
        </span>
      )}
    </div>
  );
}

export function BlogEditor({
  post,
  siteUrl,
  categories,
}: {
  post: BlogPostInput | null;
  siteUrl: string;
  categories: string[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    slugTouched: !!post,
    content: post?.content ?? "",
    excerpt: post?.excerpt ?? "",
    coverImage: post?.coverImage ?? "",
    coverAlt: post?.coverAlt ?? "",
    category: post?.category ?? "",
    tags: (post?.tags ?? []).join(", "),
    authorName: post?.authorName ?? "",
    publishedAt: toLocalInput(post?.publishedAt ?? null),
    metaTitle: post?.metaTitle ?? "",
    metaDescription: post?.metaDescription ?? "",
    focusKeyword: post?.focusKeyword ?? "",
    canonicalUrl: post?.canonicalUrl ?? "",
    noindex: post?.noindex ?? false,
  });
  const [busy, setBusy] = useState(false);
  const { pick, picker } = useMediaPicker("Insert image");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const slug = f.slugTouched ? slugify(f.slug) : slugify(f.title);
  const seo = useMemo(
    () =>
      analyzeSeo({
        title: f.title,
        slug,
        content: f.content,
        excerpt: f.excerpt,
        metaTitle: f.metaTitle,
        metaDescription: f.metaDescription,
        focusKeyword: f.focusKeyword,
        coverImage: f.coverImage,
        coverAlt: f.coverAlt,
      }),
    [f, slug]
  );
  const words = useMemo(() => wordCount(f.content), [f.content]);
  const serpTitle = (f.metaTitle || f.title || "Article title").slice(0, 70);
  const serpDesc = (f.metaDescription || f.excerpt || "The meta description appears here, under the title in Google.").slice(0, 170);
  const scoreTone = seo.score >= 80 ? "text-emerald-400 border-emerald-500/40" : seo.score >= 50 ? "text-amber-400 border-amber-500/40" : "text-red-400 border-red-500/40";
  const isPublished = post?.status === "PUBLISHED";

  const save = async (status: "DRAFT" | "PUBLISHED") => {
    if (f.title.trim().length < 3) return toast.error("Give the article a title");
    if (!f.content.replace(/<[^>]+>/g, "").trim()) return toast.error("The article is empty");
    setBusy(true);
    try {
      const res = await fetch(post ? `/api/admin/blog/${post.id}` : "/api/admin/blog", {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.title.trim(),
          slug,
          content: f.content,
          excerpt: f.excerpt,
          coverImage: f.coverImage,
          coverAlt: f.coverAlt,
          category: f.category,
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          authorName: f.authorName,
          status,
          publishedAt: f.publishedAt ? new Date(f.publishedAt).toISOString() : "",
          metaTitle: f.metaTitle,
          metaDescription: f.metaDescription,
          focusKeyword: f.focusKeyword,
          canonicalUrl: f.canonicalUrl,
          noindex: f.noindex,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const scheduled = status === "PUBLISHED" && f.publishedAt && new Date(f.publishedAt).getTime() > Date.now();
      toast.success(status === "DRAFT" ? "Draft saved" : scheduled ? "Scheduled" : "Published", {
        description: status === "PUBLISHED" && !scheduled ? `Live at /blog/${d.post.slug}` : undefined,
      });
      if (!post) router.replace(`/admin/blog/${d.post.id}`);
      else router.refresh();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!post) return;
    const ok = await confirmDialog({
      title: `Delete "${post.title}"?`,
      description: "The article and its URL are removed from the site. This cannot be undone.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Couldn't delete it");
    toast.success("Article deleted");
    router.replace("/admin/blog");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/blog" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All articles
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {post && isPublished && (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
              <ExternalLink className="h-4 w-4" /> View
            </a>
          )}
          <button type="button" disabled={busy} onClick={() => save("DRAFT")} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {isPublished ? <EyeOff className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {isPublished ? "Unpublish" : "Save draft"}
          </button>
          <button type="button" disabled={busy} onClick={() => save("PUBLISHED")} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
            <Send className="h-4 w-4" /> {isPublished ? "Update" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Writing */}
        <div className="min-w-0 space-y-4">
          <input
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Article title"
            maxLength={200}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xl font-bold text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none sm:text-2xl"
          />
          <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
            <span className="text-slate-500">{siteUrl.replace(/^https?:\/\//, "")}/blog/</span>
            <input
              value={f.slugTouched ? f.slug : slug}
              onChange={(e) => setF((x) => ({ ...x, slug: e.target.value, slugTouched: true }))}
              className="min-w-40 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-200 focus:border-blue-500 focus:outline-none"
              aria-label="URL slug"
            />
          </div>
          <RichTextEditor
            value={f.content}
            onChange={(html) => set("content", html)}
            onPickImage={pick}
            minHeightClass="min-h-[28rem]"
            placeholder="Start writing… Use H2/H3 for sections, add images with alt text, and link to other pages."
            showCount
          />
          <Box title="Excerpt">
            <Label count={f.excerpt.length} max={300}>Shown on the blog list and used when there is no meta description.</Label>
            <textarea value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} maxLength={600} className={cn(inp, "min-h-20")} />
          </Box>
        </div>

        {/* Sidebar */}
        <div className="min-w-0 space-y-4">
          <Box
            title="SEO score"
            right={<span className={cn("rounded-full border px-2.5 py-0.5 text-sm font-extrabold tabular-nums", scoreTone)}>{seo.score}/100</span>}
          >
            <div>
              <Label>Focus keyword</Label>
              <input value={f.focusKeyword} onChange={(e) => set("focusKeyword", e.target.value)} className={inp} placeholder="e.g. earn money online" />
            </div>
            <ul className="space-y-1.5 text-xs">
              {seo.checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  {c.level === "good" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : c.level === "warn" ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  <span className={c.ok ? "text-slate-400" : "text-slate-200"}>{c.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500">{words.toLocaleString()} words · ~{Math.max(1, Math.round(words / 200))} min read</p>
          </Box>

          <Box title="Google preview">
            <div className="rounded-lg bg-white p-3">
              <p className="truncate text-[12px] text-[#202124]">{siteUrl.replace(/^https?:\/\//, "")} › blog › {slug || "…"}</p>
              <p className="mt-0.5 line-clamp-1 text-[17px] leading-snug text-[#1a0dab]">{serpTitle}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{serpDesc}</p>
            </div>
            <div>
              <Label count={f.metaTitle.length} max={META_TITLE_MAX}>SEO title (blank = article title)</Label>
              <input value={f.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} className={inp} maxLength={120} />
            </div>
            <div>
              <Label count={f.metaDescription.length} max={META_DESC_MAX}>Meta description</Label>
              <textarea value={f.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} className={cn(inp, "min-h-20")} maxLength={400} />
            </div>
          </Box>

          <Box title="Publishing">
            <div>
              <Label>Publish date (leave empty = now; a future date schedules it)</Label>
              <DateField type="datetime-local" value={f.publishedAt} onChange={(v) => set("publishedAt", v)} className={inp} />
            </div>
            <div>
              <Label>Author name</Label>
              <input value={f.authorName} onChange={(e) => set("authorName", e.target.value)} className={inp} placeholder="The RevType Team" maxLength={80} />
            </div>
            <div>
              <Label>Category</Label>
              <input value={f.category} onChange={(e) => set("category", e.target.value)} className={inp} list="blog-categories" placeholder="Guides" maxLength={60} />
              <datalist id="blog-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <input value={f.tags} onChange={(e) => set("tags", e.target.value)} className={inp} placeholder="earning, bkash, tips" />
            </div>
          </Box>

          <Box title="Cover image">
            <ImageUploadField value={f.coverImage} onChange={(url) => set("coverImage", url)} title="Select cover image" />
            <div>
              <Label>Alt text (describe the image)</Label>
              <input value={f.coverAlt} onChange={(e) => set("coverAlt", e.target.value)} className={inp} maxLength={200} />
            </div>
            <p className="text-[11px] text-slate-500">Best at 1200×630 — it is also the picture when the article is shared.</p>
          </Box>

          <Box title="Advanced">
            <div>
              <Label>Canonical URL (only if first published elsewhere)</Label>
              <input value={f.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} className={inp} placeholder="https://…" />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-200">
              <input type="checkbox" checked={f.noindex} onChange={(e) => set("noindex", e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>Hide from search engines <span className="block text-[11px] text-slate-500">Also keeps it off the blog list and the sitemap; the link still works.</span></span>
            </label>
            {post && (
              <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 text-sm text-red-300 hover:text-red-200">
                <Trash2 className="h-4 w-4" /> Delete article
              </button>
            )}
          </Box>
        </div>
      </div>
      {picker}
    </div>
  );
}
