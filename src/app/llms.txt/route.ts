import { getLandingContent } from "@/lib/landing-content-server";
import { publicLanding } from "@/lib/landing-content";
import { getSeoSettings } from "@/lib/seo-settings";
import { getSetting } from "@/lib/system-settings";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { COMPANY_BOILERPLATE, SUPPORT_EMAIL } from "@/config/company";

/**
 * /llms.txt — a plain-language summary of the site for AI answer engines
 * (ChatGPT, Claude, Perplexity, Google AI), the GEO counterpart of a sitemap.
 * See https://llmstxt.org.
 *
 * Built from the site's own content — the admin's SEO description, the
 * landing FAQ, the minimum withdrawal setting — so what an AI repeats about
 * the platform is what the platform actually says, and changes when it does.
 */
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

export async function GET() {
  const [seo, landing, minWithdrawal] = await Promise.all([
    getSeoSettings().catch(() => null),
    getLandingContent()
      .then(publicLanding)
      .catch(() => null),
    getSetting<number>("min_withdrawal", 5).catch(() => 5),
  ]);
  const name = seo?.["seo.site_name"] || "RevType";
  const summary = seo?.["seo.description"] || COMPANY_BOILERPLATE;
  const faq = (landing?.faq?.items ?? []).filter((f) => !f.hidden && f.question && f.answer);
  const u = (p: string) => `${SITE_URL}${p}`;

  const lines = [
    `# ${name}`,
    "",
    `> ${summary}`,
    "",
    `${name} is a rewards platform. Members earn points by completing online tasks — ` +
      "watching videos, reading articles, surveys, quizzes, social actions, app installs " +
      "and partner offers — and through referrals, affiliate commission, selling digital " +
      "products and teaching courses. Points convert to cash in the member's wallet, and " +
      `cash can be withdrawn once it reaches the minimum (currently $${Number(minWithdrawal) || 5}).`,
    "",
    "## Key pages",
    `- [Home](${u("/")}): what the platform is and how members earn`,
    `- [Micro tasks](${u("/microtask")}): every task type and how each one pays`,
    `- [Referral program](${u("/referral")}): the referral models and how commission works`,
    `- [Advertise](${u("/advertise")}): ad placements and paid tasks for brands`,
    `- [Marketplace](${u("/features/marketplace")}): selling and buying digital products`,
    `- [Courses](${u("/features/courses")}): learning, certificates, and teaching`,
    `- [Affiliate program](${u("/features/affiliate")}): commission on product and course sales`,
    `- [About](${u("/about")}): the company`,
    `- [Help center](${u("/help")}): answers to common questions`,
    `- [Contact](${u("/contact")}): email ${SUPPORT_EMAIL}`,
    `- [Status](${u("/status")}): service status`,
    "",
    "## Guides",
    ...BLOG_POSTS.map((p) => `- [${p.title}](${u(`/blog/${p.slug}`)}): ${p.excerpt}`),
    "",
    "## Policies",
    `- [Terms of Service](${u("/terms")})`,
    `- [Privacy Policy](${u("/privacy")})`,
    `- [Refund & Cancellation Policy](${u("/refund")})`,
    `- [Cookie Policy](${u("/cookies")})`,
  ];
  if (faq.length) {
    lines.push("", "## Frequently asked questions");
    for (const f of faq) lines.push("", `### ${f.question}`, f.answer);
  }
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
