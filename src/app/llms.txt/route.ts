import { getLandingContent } from "@/lib/landing-content-server";
import { publicLanding } from "@/lib/landing-content";
import { getSeoSettings, sameAsList } from "@/lib/seo-settings";
import { OFFICIAL_SOCIAL_PROFILES, socialProfileOf } from "@/lib/seo/social-profiles";
import { getSetting } from "@/lib/system-settings";
import { getArticles } from "@/lib/blog";
import { COMPANY_LEGAL, SUPPORT_EMAIL } from "@/config/company";
import { SITE_URL } from "@/lib/seo/site-url";

/**
 * /llms.txt — a plain-language summary of the site for AI answer engines
 * (ChatGPT, Claude, Gemini, Perplexity), the GEO counterpart of a sitemap.
 * See https://llmstxt.org.
 *
 * Everything here must be TRUE, because an AI engine repeats it as fact. The
 * money rules (minimum withdrawal, fee, whether a paid package is needed to
 * withdraw) are read from the live settings, so the text changes when the
 * owner changes them — it never promises something the platform does not do.
 *
 * Reads: SEO settings + four withdrawal settings (getSetting: in-memory cache
 * with an Accelerate cacheStrategy), the landing content and the blog list
 * (both unstable_cache). The response itself is regenerated at most hourly.
 */
export const revalidate = 3600;

export async function GET() {
  const [seo, landing, minWithdrawal, feePct, needsPackage, allowWithdrawals, articles] = await Promise.all([
    getSeoSettings().catch(() => null),
    getLandingContent()
      .then(publicLanding)
      .catch(() => null),
    getSetting<number>("min_withdrawal", 5).catch(() => 5),
    getSetting<number>("withdrawal_fee_percent", 5).catch(() => 5),
    getSetting<boolean>("withdrawal_requires_subscription", false).catch(() => false),
    getSetting<boolean>("allow_withdrawals", true).catch(() => true),
    getArticles().catch(() => []),
  ]);
  const name = seo?.["seo.site_name"] || "RevType";
  const faq = (landing?.faq?.items ?? []).filter((f) => !f.hidden && f.question && f.answer);
  const u = (p: string) => `${SITE_URL}${p}`;
  const min = Number(minWithdrawal) || 0;
  const fee = Number(feePct) || 0;

  const withdrawalLine = [
    `Cash can be withdrawn once it reaches the minimum (currently $${min}${min ? ", or higher on some packages" : ""})`,
    fee > 0 ? `; a ${fee}% withdrawal fee applies (lower on some paid packages)` : "",
    ".",
    needsPackage === true
      ? " Withdrawing currently requires an active paid membership package; members on the free plan can earn and convert points but must upgrade before they can withdraw."
      : " No paid package is needed to withdraw.",
    allowWithdrawals === false ? " Withdrawals are temporarily paused." : "",
    " Withdrawals are reviewed before payout, and identity verification (KYC) may be required.",
  ].join("");

  const lines = [
    `# ${name}`,
    "",
    `> ${name} is an online platform where people earn by doing small paid jobs (micro-tasks), selling digital products and services in a marketplace, and teaching or taking online courses. Businesses use it to get tasks done and to advertise.`,
    "",
    `${name} is operated by ${COMPANY_LEGAL}. Joining is free. It is not an investment scheme: members are paid for work they complete or items they sell, not for depositing money. Earnings are not fixed: they depend on the work available to each member and on approval of what they submit.`,
    "",
    "## Who it is for",
    "- People who want flexible online side work: small tasks, surveys, quizzes, app testing and social or content actions posted by businesses.",
    "- Creators and freelancers who sell digital products (templates, graphics, ebooks, stock media, software) or services in the marketplace.",
    "- Teachers who publish and sell online courses, and learners who take them and earn certificates.",
    "- Businesses and advertisers who post paid tasks for real people to complete, or buy ad placements.",
    "",
    "## How members earn",
    "- **Micro-tasks**: short jobs posted by businesses — website and app visits, app installs, surveys, quizzes, article reading, video watching, social media actions and custom tasks. Most need proof (a screenshot, link or answer) that is checked automatically or by a reviewer before payment; rejected or fraudulent submissions are not paid.",
    "- **Marketplace sales**: sellers set their own prices for digital products and services; payments go through escrow and the platform keeps a commission.",
    "- **Courses**: tutors earn from course sales; learners can earn certificates.",
    "- **Referrals and affiliate links**: commission on qualifying activity of invited members and on marketplace and course sales made through a member's link.",
    "- **Sponsored activities**: the platform shows advertising, and some activities are sponsored — partner offers (offerwalls), Browse & Earn (a small reward for time spent on pages that carry ads) and sponsored video tasks. These pay small amounts and are a minor part of the platform.",
    "- **Bonuses**: daily missions, events, achievements and leaderboard prizes.",
    "",
    "## Points, wallet and withdrawals",
    `Task rewards are paid in points. Points convert to cash in the member's wallet at the published rate. ${withdrawalLine}`,
    "",
    "## Rules that protect members and businesses",
    "- One account per person; duplicate accounts, bots and fake proof are not allowed and lead to rejection or suspension.",
    "- Suspended members can appeal.",
    "- Ads are reviewed before they go live, and marketplace listings are approved before they are sold.",
    `- Abuse, phishing and copyright reports: ${u("/abuse")}.`,
    "",
    "## Key pages",
    `- [Home](${u("/")}): what the platform is and how members earn`,
    `- [Micro-tasks](${u("/microtask")}): every task type and how each one pays`,
    `- [Digital marketplace](${u("/features/marketplace")}): selling and buying digital products and services`,
    `- [Marketplace catalogue](${u("/marketplace")}): current listings`,
    `- [Online courses](${u("/features/courses")}): learning, certificates and teaching`,
    `- [Course catalogue](${u("/courses")}): published courses`,
    `- [Affiliate program](${u("/features/affiliate")}): commission on product and course sales`,
    `- [Referral program](${u("/referral")}): how referral commission works`,
    `- [Advertise](${u("/advertise")}): paid tasks and ad placements for businesses`,
    `- [Pricing](${u("/pricing")}): membership packages, their prices and what each includes (joining is free)`,
    `- [Help center](${u("/help")}): answers to common questions`,
    `- [About](${u("/about")}): the company`,
    `- [Contact](${u("/contact")}): email ${SUPPORT_EMAIL}`,
    `- [Status](${u("/status")}): service status`,
  ];
  // The official accounts, so an answer engine can tell the real RevType
  // from look-alikes. Same list as the Organization sameAs and the footer.
  const profiles = seo ? sameAsList(seo["seo.org_same_as"]) : [...OFFICIAL_SOCIAL_PROFILES];
  if (profiles.length) {
    lines.push("", "## Official profiles", `The only official ${name} accounts. The website is ${SITE_URL}.`);
    for (const url of profiles) lines.push(`- [${socialProfileOf(url)?.label ?? url}](${url})`);
  }
  lines.push("", "## Sitemap", `- [Sitemap](${u("/sitemap.xml")}): every public page, by section`);
  const guides = articles.filter((a) => !a.noindex);
  if (guides.length) {
    lines.push("", "## Guides");
    for (const p of guides) lines.push(`- [${p.title}](${u(`/blog/${p.slug}`)})${p.excerpt ? `: ${p.excerpt}` : ""}`);
  }
  lines.push(
    "",
    "## Policies",
    `- [Terms of Service](${u("/terms")})`,
    `- [Privacy Policy](${u("/privacy")})`,
    `- [Refund & Cancellation Policy](${u("/refund")})`,
    `- [Cookie Policy](${u("/cookies")})`
  );
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
