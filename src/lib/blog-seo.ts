/**
 * The SEO checklist on the article editor (/admin/blog). Client-safe.
 *
 * The same checks a search-optimisation plugin makes, scored as a nudge rather
 * than a gate: a publish is never blocked. Every check says what to do in one
 * short line, because "Keyword density 0.3%" alone does not tell a writer
 * anything.
 */

import { htmlToText } from "@/lib/rich-html";

export interface SeoInput {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  coverImage: string;
  coverAlt: string;
}

export interface SeoCheck {
  id: string;
  ok: boolean;
  /** "good" when ok; otherwise how much it matters. */
  level: "good" | "warn" | "bad";
  text: string;
  /** 2 for the checks that matter most, else 1. */
  weight: number;
}

export const META_TITLE_MAX = 60;
export const META_DESC_MIN = 120;
export const META_DESC_MAX = 160;

/** "How to Earn Online!" → "how-to-earn-online". Keeps Bangla letters. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ঀ-৿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function wordCount(html: string): number {
  const t = htmlToText(html);
  return t ? t.split(/\s+/).length : 0;
}

export function readingMinutes(html: string): number {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function countOccurrences(text: string, phrase: string): number {
  if (!phrase) return 0;
  let n = 0;
  let i = text.indexOf(phrase);
  while (i !== -1) {
    n++;
    i = text.indexOf(phrase, i + phrase.length);
  }
  return n;
}

export function analyzeSeo(i: SeoInput): { score: number; checks: SeoCheck[] } {
  const kw = norm(i.focusKeyword);
  const text = norm(htmlToText(i.content));
  const words = text ? text.split(" ").length : 0;
  const title = i.metaTitle.trim() || i.title.trim();
  const desc = i.metaDescription.trim() || i.excerpt.trim();
  const firstPara = norm(htmlToText((i.content.match(/<p[^>]*>[\s\S]*?<\/p>/i) ?? [""])[0]));
  const headings = [...i.content.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi)].map((m) => norm(htmlToText(m[1])));
  const imgs = [...i.content.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgsNoAlt = imgs.filter((t) => !/\salt\s*=\s*"[^"]+"/i.test(t)).length;
  const links = [...i.content.matchAll(/<a\b[^>]*href\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
  const internal = links.filter((h) => h.startsWith("/") || /revtype\.com/i.test(h)).length;
  const external = links.length - internal;
  const density = kw && words ? (countOccurrences(text, kw) * kw.split(" ").length * 100) / words : 0;

  const checks: SeoCheck[] = [];
  const add = (id: string, ok: boolean, good: string, fix: string, weight: "warn" | "bad" = "warn") =>
    checks.push({ id, ok, level: ok ? "good" : weight, text: ok ? good : fix, weight: weight === "bad" ? 2 : 1 });

  add("kw", !!kw, "Focus keyword is set.", "Set a focus keyword — the phrase people would search for.", "bad");
  if (kw) {
    add("kw-title", norm(title).includes(kw), "Keyword is in the SEO title.", "Put the focus keyword in the SEO title, ideally near the start.", "bad");
    add("kw-desc", norm(desc).includes(kw), "Keyword is in the meta description.", "Use the focus keyword in the meta description.");
    add("kw-slug", i.slug.includes(slugify(kw)), "Keyword is in the URL.", "Put the focus keyword in the URL slug.");
    add("kw-intro", firstPara.includes(kw), "Keyword appears in the first paragraph.", "Mention the focus keyword in the first paragraph.");
    add("kw-heading", headings.some((h) => h.includes(kw)), "Keyword is in a subheading.", "Use the focus keyword in at least one H2 or H3.");
    add(
      "kw-density",
      density >= 0.5 && density <= 3,
      `Keyword density ${density.toFixed(1)}% — natural.`,
      density < 0.5
        ? `Keyword density ${density.toFixed(1)}% — use the keyword a few more times.`
        : `Keyword density ${density.toFixed(1)}% — too repetitive; use synonyms.`
    );
  }
  add(
    "title-len",
    title.length >= 30 && title.length <= META_TITLE_MAX,
    `SEO title length ${title.length} — good.`,
    title.length < 30 ? `SEO title is short (${title.length}). Aim for 30–${META_TITLE_MAX} characters.` : `SEO title is ${title.length} characters; Google cuts it after about ${META_TITLE_MAX}.`
  );
  add(
    "desc-len",
    desc.length >= META_DESC_MIN && desc.length <= META_DESC_MAX,
    `Meta description length ${desc.length} — good.`,
    desc.length === 0
      ? "Write a meta description — the text under the title in Google."
      : desc.length < META_DESC_MIN
        ? `Meta description is short (${desc.length}). Aim for ${META_DESC_MIN}–${META_DESC_MAX}.`
        : `Meta description is ${desc.length} characters; Google cuts it after about ${META_DESC_MAX}.`,
    desc.length === 0 ? "bad" : "warn"
  );
  add(
    "length",
    words >= 600,
    `${words.toLocaleString()} words — enough depth to rank.`,
    `${words.toLocaleString()} words. Articles under 600 words rarely rank; aim for 900+.`,
    words < 300 ? "bad" : "warn"
  );
  add("headings", headings.length >= 2, "Content is broken up with subheadings.", "Add H2/H3 subheadings every 200–300 words.");
  add("cover", !!i.coverImage, "Has a cover image (used when shared).", "Add a cover image — it is the picture on Facebook, WhatsApp and Google Discover.");
  add("cover-alt", !i.coverImage || !!i.coverAlt.trim(), "Cover image has alt text.", "Describe the cover image in its alt text.");
  add("img-alt", imgsNoAlt === 0, "Every image has alt text.", `${imgsNoAlt} image(s) have no alt text.`);
  add("internal", internal >= 1, "Links to other pages on the site.", "Link to at least one other page on the site (a task page, another article).");
  add("external", external >= 1, "Cites an outside source.", "Link to one trustworthy outside source — it builds trust (E-E-A-T).");

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0);
  return { score: total ? Math.round((got / total) * 100) : 0, checks };
}
