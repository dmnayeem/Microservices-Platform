import "dotenv/config";
import fs from "fs";
import path from "path";
import { NextRequest, type NextFetchEvent } from "next/server";
import middleware from "../middleware";
import {
  isPublicCatalogPath,
  MARKETPLACE_PRIVATE_SEGMENTS,
  plainSummary,
  indexPageSeo,
  loginHref,
  canonicalUrl,
} from "../src/lib/public-catalog";
import { listingLd, courseLd, breadcrumbLd, itemListLd } from "../src/lib/public-catalog-schema";

/**
 * Public marketplace + course catalog (2026-10-03).
 *
 * Logged-out visitors and search engines may read the marketplace and course
 * browse / category / brand / detail pages; every private flow under the same
 * prefixes (cart, orders, messages, create, my-learning, the lesson player,
 * the course creator) stays behind the login, and nothing paid or private is
 * in a guest's payload.
 *
 * The middleware is exercised by CALLING it — `next dev` on Next 16 does not
 * run middleware, so a live probe would prove nothing.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-public-catalog.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\n1. Public path list is exact");
  const pub = [
    "/marketplace",
    "/marketplace/",
    "/marketplace/cm1abc23def",
    "/marketplace/section/services",
    "/marketplace/section/stock",
    "/marketplace/brand/nova-stock-studio",
    "/courses",
    "/courses/intro-to-seo",
    "/courses/category/marketing",
  ];
  for (const p of pub) check(`public: ${p}`, isPublicCatalogPath(p));
  const priv = [
    "/marketplace/cart",
    "/marketplace/create",
    "/marketplace/messages",
    "/marketplace/messages/t1",
    "/marketplace/my",
    "/marketplace/orders",
    "/marketplace/section",
    "/marketplace/brand",
    "/marketplace/cm1abc/checkout",
    "/marketplace/cm1abc/edit",
    "/marketplace/x.y",
    "/courses/category",
    "/courses/abc/learn",
    "/learn/c1",
    "/learn/c1/live/x",
    "/my-learning",
    "/course-creator",
    "/tutor",
    "/tutor/courses/new",
    "/wallet",
    "/api/marketplace/listings",
    "/api/cart",
    "/api/courses/c1/enroll",
    "/marketplacex",
    "/coursesx/a",
  ];
  for (const p of priv) check(`private: ${p}`, !isPublicCatalogPath(p));

  console.log("\n2. Every private folder under /marketplace is on the private list");
  const mpDir = path.join(root, "src/app/(main)/marketplace");
  const staticFolders = fs
    .readdirSync(mpDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("["))
    .map((d) => d.name);
  for (const f of staticFolders) {
    if (f === "section" || f === "brand") continue;
    check(
      `/marketplace/${f} is private`,
      (MARKETPLACE_PRIVATE_SEGMENTS as readonly string[]).includes(f) && !isPublicCatalogPath(`/marketplace/${f}`)
    );
  }
  const courseDir = path.join(root, "src/app/(main)/courses");
  const courseStatic = fs
    .readdirSync(courseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("["))
    .map((d) => d.name);
  check(
    "/courses has no static folder but category (anything new must be reviewed here)",
    courseStatic.every((f) => f === "category"),
    courseStatic.join(",")
  );
  // No nested pages under the public detail routes (they would inherit "public").
  const nested = (dir: string) =>
    fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  check("no sub-pages under /marketplace/[id]", nested(path.join(mpDir, "[id]")).length === 0);
  check("no sub-pages under /courses/[slug]", nested(path.join(courseDir, "[slug]")).length === 0);

  console.log("\n3. Middleware (called directly): guests reach catalog pages, not private flows");
  const ev = { waitUntil: () => {} } as unknown as NextFetchEvent;
  const call = async (p: string) => {
    const req = new NextRequest(new URL(p, "https://revtype.com"));
    const res = (await middleware(req, ev)) as Response | undefined;
    return { status: res?.status ?? 200, location: res?.headers.get("location") ?? "", xp: res?.headers.get("x-middleware-request-x-pathname") ?? "" };
  };
  for (const p of ["/marketplace", "/marketplace/cm1abc23def", "/marketplace/section/services", "/marketplace/brand/nova", "/courses", "/courses/intro", "/courses/category/marketing"]) {
    const r = await call(p);
    check(`guest ${p} → allowed (${r.status})`, r.status < 300, r.location);
    check(`guest ${p} → x-pathname set from the URL`, r.xp === p, r.xp);
  }
  for (const p of ["/marketplace/cart", "/marketplace/orders", "/marketplace/messages/t1", "/marketplace/create", "/marketplace/my", "/my-learning", "/learn/c1", "/course-creator", "/api/cart"]) {
    const r = await call(p);
    check(`guest ${p} → sent to /login`, r.status >= 300 && r.status < 400 && /\/login/.test(r.location), `${r.status} ${r.location}`);
  }
  // A client-sent x-pathname must not survive: middleware overwrites it.
  {
    const req = new NextRequest(new URL("/marketplace/cm1abc", "https://revtype.com"), { headers: { "x-pathname": "/wallet" } });
    const res = (await middleware(req, ev)) as Response | undefined;
    const xp = res?.headers.get("x-middleware-request-x-pathname") ?? "";
    check("spoofed x-pathname is overwritten", xp === "/marketplace/cm1abc", xp);
  }

  console.log("\n4. Wiring");
  const cfg = read("src/lib/auth/config.ts");
  check("auth config uses isPublicCatalogPath", /isPublicCatalogPath\(pathname\)/.test(cfg));
  check("auth publicRoutes has no bare /marketplace or /courses prefix", !/"\/marketplace"|"\/courses"/.test(cfg.slice(cfg.indexOf("const publicRoutes"), cfg.indexOf("const adminRoutes"))));
  const layout = read("src/app/(main)/layout.tsx");
  check("(main) layout: guest shell only for isPublicCatalogPath", /isPublicCatalogPath\(guestPath\)/.test(layout) && /<GuestShell>/.test(layout));
  check("(main) layout: other guests still redirected", /redirect\("\/login"\)/.test(layout));
  check("(main) layout: signed-in page-visibility guard kept", /isPathHidden\(pathname, hiddenPaths\)/.test(layout) && /<PageAccessGuard/.test(layout));
  check("guest shell has no ads / prompts", !/AdRenderer|AutoAds|AnchorAdBar|PushPermission|PwaInstall/.test(read("src/components/public/guest-shell.tsx")));

  console.log("\n5. Nothing paid or private in a guest payload");
  const data = read("src/lib/public-catalog-data.ts");
  const readListingSrc = data.slice(data.indexOf("async function readListing"), data.indexOf("export const getPublicListing"));
  for (const f of ["files:", "attachments: true", "fileMeta", "reservePrice: true", "rejectionReason", "affiliateCommission", "reviewedById", "sellerId: true"]) {
    check(`public listing read does not select ${f}`, !readListingSrc.includes(f));
  }
  check("guest attachments forced empty", /attachments: \[\] as string\[\]/.test(readListingSrc));
  check("NDA listing: screenshots + financials withheld", /screenshots: nda \? \[\]/.test(readListingSrc) && /monthlyRevenue: nda \? null/.test(readListingSrc));
  check("details filtered to the category's own fields", /allowedKeys/.test(readListingSrc));
  const landing = read("src/lib/course-landing.ts");
  const outline = landing.slice(landing.indexOf("const LESSON_OUTLINE"), landing.indexOf("} as const;", landing.indexOf("const LESSON_OUTLINE")));
  for (const f of ["content", "videoUrl", "transcript", "resources", "subtitlesUrl", "quizId", "assignmentId", "liveClassId"]) {
    check(`lesson outline does not select ${f}`, !new RegExp(`\\b${f}:`).test(outline));
  }
  check("course landing uses select, not include", !/include:\s*\{\s*modules/.test(landing) && /\.\.\.COURSE_PUBLIC/.test(landing));
  const coursePublic = landing.slice(landing.indexOf("const COURSE_PUBLIC"), landing.indexOf("} as const;", landing.indexOf("const COURSE_PUBLIC")));
  for (const f of ["totalRevenueCents", "commissionRateBps", "createdById", "status:"]) {
    check(`course select excludes ${f}`, !coursePublic.includes(f));
  }
  check("guest course payload strips tutor commission", /affiliateCommissionValue: null/.test(data));
  const ldv = read("src/components/user/marketplace/listing-detail-view.tsx");
  check("listing view: guest skips the session-only view beacon", /if \(guest\) return;/.test(ldv));
  check("listing view: bid/offer panels not mounted for guests", /listing\.auctionMode && !guest/.test(ldv) && /=== "ACTIVE" && !guest/.test(ldv));
  check("listing view: guest actions are sign-in links", (ldv.match(/href=\{signIn\}/g) ?? []).length >= 4);
  const cta = read("src/components/user/courses/CourseEnrollCta.tsx");
  check("enrol CTA: guest gets a sign-in link, no coupon / bookmark calls", /signInHref \? \(/.test(cta) && /!signInHref && \(/.test(cta));
  check("loginHref returns to the page", loginHref("/marketplace/abc") === "/login?callbackUrl=%2Fmarketplace%2Fabc");

  console.log("\n6. Pages: metadata, guest branch, structured data");
  const pages: Array<[string, string[]]> = [
    ["src/app/(main)/marketplace/page.tsx", ["generateMetadata", "PublicMarketplaceIndex", "itemListLd", "breadcrumbLd"]],
    ["src/app/(main)/marketplace/[id]/page.tsx", ["generateMetadata", "getPublicListing", "listingLd", "breadcrumbLd", "GUEST_LISTING_STATUSES", 'viewerId=""']],
    ["src/app/(main)/marketplace/section/[slug]/page.tsx", ["generateMetadata", "itemListLd", "breadcrumbLd", "Pagination"]],
    ["src/app/(main)/marketplace/brand/[slug]/page.tsx", ["generateMetadata", "itemListLd", "breadcrumbLd", "Pagination"]],
    ["src/app/(main)/courses/page.tsx", ["generateMetadata", "PublicCoursesIndex", "itemListLd", "breadcrumbLd"]],
    ["src/app/(main)/courses/[slug]/page.tsx", ["generateMetadata", "getPublicCourseLanding", "courseLd", "breadcrumbLd", "guest"]],
    ["src/app/(main)/courses/category/[slug]/page.tsx", ["generateMetadata", "itemListLd", "breadcrumbLd", "Pagination"]],
  ];
  for (const [p, needles] of pages) {
    const src = read(p);
    for (const n of needles) check(`${p.replace("src/app/(main)/", "")}: ${n.trim()}`, src.includes(n));
    check(`${p.replace("src/app/(main)/", "")}: no unconditional login redirect`, !/if \(!session\?\.user(\?\.id)?\) redirect\("\/login"\)/.test(src));
  }

  console.log("\n7. Structured data builders");
  const svc = listingLd({
    id: "L1", title: "Logo design", description: "<p>I design <b>logos</b></p>", assetType: "SERVICE",
    categoryLabel: "Service", price: 25, currency: "usd", status: "ACTIVE", images: ["https://revtype.com/api/media/media/a.png"],
    seller: { name: "Ann", isBrand: false }, createdAt: "2026-10-01T00:00:00Z",
  });
  check("SERVICE → Service", svc["@type"] === "Service");
  check("Service: areaServed Worldwide + provider + offers", svc.areaServed === "Worldwide" && !!svc.provider && !!svc.offers);
  check("Service: description has no HTML", !String(svc.description).includes("<"));
  const prod = listingLd({
    id: "L2", title: "Ebook", description: "x", assetType: "EBOOK", categoryLabel: "Ebook", price: 9.5, currency: "USD",
    status: "SOLD", images: [], seller: { name: "Nova", isBrand: true, url: canonicalUrl("/marketplace/brand/nova") }, createdAt: "2026-10-01T00:00:00Z",
  });
  const offer = prod.offers as Record<string, unknown>;
  check("product → Product + Offer", prod["@type"] === "Product" && offer["@type"] === "Offer");
  check("Offer: price/currency/availability", offer.price === 9.5 && offer.priceCurrency === "USD" && String(offer.availability).endsWith("OutOfStock"));
  check("Offer: brand seller is an Organization", (offer.seller as Record<string, unknown>)["@type"] === "Organization");
  check("Product: no rating invented", !("aggregateRating" in prod) && !("review" in prod));
  const base = {
    path: "/courses/seo", title: "SEO", description: "Learn SEO", language: "en", isFree: false, price: 19,
    images: [], tutorName: "Tia", category: "Marketing", skillLevel: "BEGINNER", totalDuration: 125, avgRating: 4.6, datePublished: "2026-09-01",
  };
  const c0 = courseLd({ ...base, reviewCount: 0, reviews: [] });
  check("Course: provider Organization RevType", (c0.provider as Record<string, unknown>).name === "RevType");
  check("Course: instructor Person + hasCourseInstance + offers", (c0.instructor as Record<string, unknown>)["@type"] === "Person" && !!c0.hasCourseInstance && !!c0.offers);
  check("Course without reviews: no aggregateRating", !("aggregateRating" in c0));
  const c1 = courseLd({ ...base, reviewCount: 3, reviews: [{ author: "A", rating: 5, body: "Great", date: "2026-09-02" }] });
  check("Course with reviews: aggregateRating + review", !!c1.aggregateRating && Array.isArray(c1.review));
  const bc = breadcrumbLd([{ name: "Courses", path: "/courses" }, { name: "SEO", path: "/courses/seo" }]);
  check("BreadcrumbList absolute items", bc["@type"] === "BreadcrumbList" && JSON.stringify(bc).includes("https://"));
  check("ItemList", itemListLd("x", [{ path: "/marketplace/a", name: "a" }])["@type"] === "ItemList");
  for (const ld of [svc, prod, c0, c1, bc]) check(`JSON-LD round-trips (${ld["@type"]})`, JSON.parse(JSON.stringify(ld))["@type"] === ld["@type"]);

  console.log("\n8. Meta helpers");
  const long = plainSummary("<p>" + "word ".repeat(80) + "</p>");
  check("description ≤155 chars, no HTML", long.length <= 155 && !long.includes("<"), String(long.length));
  const s1 = indexPageSeo("/marketplace", {});
  check("page 1 canonical has no query, indexable", s1.canonical === canonicalUrl("/marketplace") && s1.robots.index);
  const s2 = indexPageSeo("/marketplace", { page: "1" });
  check("?page=1 canonicalises to the bare path", s2.canonical === canonicalUrl("/marketplace"));
  const s3 = indexPageSeo("/courses", { page: "3" });
  check("page 3 self-canonical", s3.canonical === `${canonicalUrl("/courses")}?page=3` && s3.robots.index);
  const s4 = indexPageSeo("/courses", { sort: "price", page: "2" });
  check("filtered/sorted → noindex,follow", !s4.robots.index && s4.robots.follow);
  check("canonical origin is https://", canonicalUrl("/x").startsWith("https://"));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
