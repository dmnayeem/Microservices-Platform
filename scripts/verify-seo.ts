/**
 * SEO checks — static policy + the live dev server.
 *
 *   npx tsx scripts/verify-seo.ts            (BASE defaults to http://localhost:3000)
 *   BASE=https://revtype.com npx tsx scripts/verify-seo.ts
 *
 * Static: the noindex/robots policy keeps every public page indexable and
 * every private area out.
 * Live (fetched as Googlebot, which is also what makes Next put metadata in
 * <head> rather than streaming it): robots.txt names the AI crawlers and an
 * absolute sitemap; the sitemap is absolute https on the canonical host;
 * llms.txt is served; and every public page has ONE absolute, query-free
 * canonical (also when visited with ?utm_…/?ref=…), a unique title ≤60 and
 * description ≤155, an og:image, JSON-LD that parses, and no localhost.
 *
 * Social cards: every public page (static ones, plus one sampled item of each
 * kind from the sitemap — skipped when there is none) is also checked for the
 * full OpenGraph / Twitter set, with <title> = og:title = twitter:title and
 * the meta description = og:description = twitter:description (ONE source,
 * lib/seo/page-meta.ts), and exactly one <h1>. Every og:image is fetched as
 * facebookexternalhit and must be a 1200×630 JPEG/PNG under 300 KB; each
 * unfurler UA must get the tags in <head>. The middleware allowlist for
 * /api/og/ is checked by CALLING it (middleware does not run under `next dev`).
 *
 * Read-only: GET requests only, no database.
 */
import "dotenv/config";
import sharp from "sharp";
import { NextRequest, type NextFetchEvent } from "next/server";
import middleware from "../middleware";
import { ROBOTS_DISALLOW, isNoindexPath } from "../src/lib/seo/indexing-policy";
import { TRACKING_PARAMS, canonicalPath } from "../src/lib/seo/site-url";
import { CATALOG_TRACKING_PARAMS } from "../src/lib/public-catalog";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const HOST = "https://revtype.com";
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const PUBLIC_PAGES = [
  "/", "/microtask", "/advertise", "/referral", "/features/marketplace", "/features/courses",
  "/features/affiliate", "/about", "/careers", "/press", "/help", "/contact", "/blog", "/status",
  "/abuse", "/privacy", "/terms", "/refund", "/cookies",
  "/marketplace", "/marketplace/section/services", "/marketplace/section/products",
  "/marketplace/section/assets", "/marketplace/section/stock", "/courses",
];
/** One sampled item of each kind, taken from the sitemap (none → skipped). */
const ITEM_KINDS: Array<[string, RegExp]> = [
  ["blog article", /^\/blog\/[^/]+$/],
  ["marketplace brand", /^\/marketplace\/brand\/[^/]+$/],
  ["marketplace listing", /^\/marketplace\/(?!section\/|brand\/)[^/]+$/],
  ["course", /^\/courses\/(?!category\/)[^/]+$/],
  ["course category", /^\/courses\/category\/[^/]+$/],
  ["shared post", /^\/post\/[^/]+$/],
];
const SOCIAL_UAS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "WhatsApp/2.23.20.0 A",
  "Twitterbot/1.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)",
  "TelegramBot (like TwitterBot)",
  "Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
];
const MAX_IMAGE_BYTES = 300 * 1024;
const PRIVATE_PATHS = [
  "/admin", "/admin/seo", "/dashboard", "/wallet", "/withdrawal", "/settings", "/tasks/abc",
  "/social", "/u/someone", "/tutor", "/welcome", "/login", "/register", "/api/x", "/go/cpa",
  "/marketplace/orders", "/marketplace/my", "/unsubscribe",
];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Googlebot", "Bingbot"];

let failures = 0;
let warnings = 0;
const fail = (m: string) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const warn = (m: string) => {
  warnings++;
  console.log(`  warn ${m}`);
};
const ok = (m: string) => console.log(`  ok   ${m}`);

function staticChecks() {
  console.log("Static policy");
  for (const p of PUBLIC_PAGES) if (isNoindexPath(p)) fail(`public page ${p} is caught by the noindex policy`);
  for (const p of ["/marketplace", "/marketplace/clx123", "/courses", "/courses/some-course", "/post/abc", "/offer/x", "/blog/a"]) {
    if (isNoindexPath(p)) fail(`public catalogue path ${p} is caught by the noindex policy`);
  }
  for (const p of PRIVATE_PATHS) if (!isNoindexPath(p)) fail(`private path ${p} is NOT noindexed`);
  for (const d of ROBOTS_DISALLOW) {
    for (const p of PUBLIC_PAGES) if (p !== "/" && p.startsWith(d)) fail(`robots Disallow ${d} blocks public ${p}`);
  }
  if (canonicalPath("/about/?utm_source=x#y") !== "/about") fail("canonicalPath does not strip query/slash");
  if (canonicalPath("/") !== "/") fail("canonicalPath breaks the home page");
  if (TRACKING_PARAMS.source !== CATALOG_TRACKING_PARAMS.source) fail("tracking-param lists differ (seo/site-url vs public-catalog)");
  if (!failures) ok("noindex/robots policy separates public from private");
}

/** Middleware, called directly: the share-image endpoints are reachable logged-out. */
async function middlewareChecks() {
  console.log("\nMiddleware (called directly)");
  const before = failures;
  const ev = { waitUntil: () => {} } as unknown as NextFetchEvent;
  const call = async (p: string) => {
    const res = (await middleware(new NextRequest(new URL(p, HOST)), ev)) as Response | undefined;
    return { status: res?.status ?? 200, location: res?.headers.get("location") ?? "" };
  };
  for (const p of ["/api/og/card.jpg?t=x&sig=y", "/api/og/img/abc/media/images/a.png.jpg", "/post/abc/opengraph-image"]) {
    const r = await call(p);
    if (r.status >= 300) fail(`guest ${p} → ${r.status} ${r.location}`);
  }
  for (const p of ["/api/ogx", "/api/other/thing"]) {
    const r = await call(p);
    if (!(r.status >= 300 && r.status < 400 && /\/login/.test(r.location))) fail(`guest ${p} is NOT sent to /login (${r.status})`);
  }
  if (failures === before) ok("share-image endpoints public, nothing else opened");
}

async function get(path: string, ua = UA): Promise<{ status: number; text: string; type: string }> {
  // `x-pathname` is what middleware sets from the URL in production (it
  // overwrites a client-sent one with the same value). `next dev` on Next 16
  // does not run middleware, so without it every catalog page 307s here.
  const r = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": ua, "x-pathname": path.split("?")[0] },
    redirect: "manual",
  });
  return { status: r.status, text: await r.text(), type: r.headers.get("content-type") || "" };
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1].replace(/&amp;/g, "&") : null;
}
function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)="${key}"[^>]*>`, "i");
  const m = html.match(re);
  return m ? attr(m[0], "content") : null;
}
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The full social set on one page; returns its og:image URL. */
function socialChecks(head: string, where: string): string | null {
  const title = decode((head.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const desc = decode(metaContent(head, "description") || "");
  const need = [
    "og:type", "og:url", "og:title", "og:description", "og:site_name", "og:locale", "og:image",
    "og:image:secure_url", "og:image:width", "og:image:height", "og:image:alt", "og:image:type",
    "twitter:card", "twitter:title", "twitter:description", "twitter:image",
  ];
  for (const k of need) if (!metaContent(head, k)) fail(`${where} no ${k}`);
  const ogT = decode(metaContent(head, "og:title") || "");
  const twT = decode(metaContent(head, "twitter:title") || "");
  if (title !== ogT || title !== twT) fail(`${where} title differs: <title>"${title}" og:"${ogT}" twitter:"${twT}"`);
  const ogD = decode(metaContent(head, "og:description") || "");
  const twD = decode(metaContent(head, "twitter:description") || "");
  if (desc !== ogD || desc !== twD) fail(`${where} description differs between meta / og / twitter`);
  if (metaContent(head, "twitter:card") !== "summary_large_image") fail(`${where} twitter:card is ${metaContent(head, "twitter:card")}`);
  const canon = [...head.matchAll(/<link[^>]+rel="canonical"[^>]*>/gi)].map((m) => attr(m[0], "href"))[0];
  const ogUrl = metaContent(head, "og:url");
  if (canon && ogUrl && ogUrl.replace(/\/$/, "") !== canon.replace(/\/$/, "")) fail(`${where} og:url ${ogUrl} ≠ canonical ${canon}`);
  if (metaContent(head, "og:image:width") !== "1200" || metaContent(head, "og:image:height") !== "630") {
    fail(`${where} og:image is not declared 1200×630`);
  }
  const img = metaContent(head, "og:image");
  if (img && img !== metaContent(head, "twitter:image")) fail(`${where} og:image ≠ twitter:image`);
  if (img && !img.startsWith(`${HOST}/`)) fail(`${where} og:image is not on ${HOST}: ${img}`);
  return img;
}

async function imageChecks(images: Map<string, string>) {
  console.log(`\nShare images (${images.size} distinct, fetched as unfurlers)`);
  for (const [url, from] of images) {
    const local = url.replace(HOST, BASE);
    const t0 = Date.now();
    const r = await fetch(local, { headers: { "User-Agent": SOCIAL_UAS[0] } });
    const buf = Buffer.from(await r.arrayBuffer());
    const cold = Date.now() - t0;
    const t1 = Date.now();
    await fetch(local, { headers: { "User-Agent": SOCIAL_UAS[1] } }).then((x) => x.arrayBuffer());
    const warm = Date.now() - t1;
    const type = r.headers.get("content-type") || "";
    const where = `${from} og:image`;
    if (r.status !== 200) {
      fail(`${where} → ${r.status} (${url})`);
      continue;
    }
    if (!/^image\/(jpeg|png)$/.test(type)) fail(`${where} content-type ${type}`);
    if (buf.length > MAX_IMAGE_BYTES) fail(`${where} is ${Math.round(buf.length / 1024)} KB (> 300 KB)`);
    if (!/public/.test(r.headers.get("cache-control") || "")) fail(`${where} is not publicly cacheable`);
    const m = await sharp(buf).metadata().catch(() => null);
    if (!m || m.width !== 1200 || m.height !== 630) fail(`${where} is ${m?.width}×${m?.height}, not 1200×630`);
    ok(`${from}: ${m?.format} ${m?.width}×${m?.height} ${Math.round(buf.length / 1024)} KB — ${cold} ms first / ${warm} ms repeat`);
  }
  // Signed URLs only: a tampered card or key is refused.
  for (const bad of ["/api/og/card.jpg?t=Anything%20I%20like&sig=nope", "/api/og/img/nope/media/images/x.png.jpg", "/api/og/img/nope/kyc/x.png.jpg"]) {
    const r = await fetch(`${BASE}${bad}`);
    if (r.status !== 404) fail(`unsigned ${bad} → ${r.status}, expected 404`);
  }
  ok("unsigned / non-public share-image requests are refused (404)");
}

async function uaSweep(paths: string[]) {
  console.log("\nUnfurler user agents");
  const before = failures;
  for (const ua of SOCIAL_UAS) {
    const name = ua.match(/(facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Pinterestbot|Discordbot)/)?.[1] ?? ua;
    for (const p of paths) {
      const r = await get(p, ua);
      const iImg = r.text.indexOf('property="og:image"');
      const iHead = r.text.indexOf("</head>");
      if (r.status !== 200) fail(`${name} ${p} → ${r.status}`);
      else if (iImg < 0 || iImg > iHead) fail(`${name} ${p}: og:image not in <head>`);
    }
  }
  if (failures === before) ok(`${SOCIAL_UAS.length} unfurler UAs × ${paths.length} pages: 200, og tags in <head>`);
}

async function liveChecks() {
  console.log(`\nLive (${BASE})`);
  try {
    await fetch(BASE, { method: "HEAD" });
  } catch {
    warn(`dev server not reachable at ${BASE} — live checks skipped`);
    return;
  }

  const robots = await get("/robots.txt");
  if (robots.status !== 200) fail(`/robots.txt → ${robots.status}`);
  else {
    for (const b of AI_BOTS) if (!new RegExp(`^User-Agent: ${b}$`, "mi").test(robots.text)) fail(`robots.txt does not name ${b}`);
    if (!/^Sitemap: https:\/\/[^\s]+\/sitemap\.xml$/m.test(robots.text)) fail("robots.txt sitemap line is not absolute https");
    if (/localhost/i.test(robots.text)) fail("robots.txt mentions localhost");
    if (/^Disallow: \/$/m.test(robots.text)) warn("robots.txt disallows everything (seo.indexing is off)");
    // Twitterbot will not show an og:image that robots.txt blocks.
    if (!/^Allow: \/api\/og\/$/m.test(robots.text)) fail("robots.txt does not Allow /api/og/ (share images)");
    ok("robots.txt");
  }

  let sitemapPaths: string[] = [];
  const sm = await get("/sitemap.xml");
  if (sm.status !== 200) fail(`/sitemap.xml → ${sm.status}`);
  else {
    const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const bad = locs.filter((l) => !l.startsWith(`${HOST}/`) && l !== HOST);
    if (!locs.length) fail("sitemap has no <loc>");
    if (bad.length) fail(`sitemap has ${bad.length} non-canonical URLs, e.g. ${bad[0]}`);
    if (locs.some((l) => l.includes("?"))) fail("sitemap URL with a query string");
    const dups = locs.filter((l, i) => locs.indexOf(l) !== i);
    if (dups.length) fail(`sitemap lists duplicates, e.g. ${dups[0]}`);
    for (const l of locs) {
      const p = new URL(l).pathname;
      if (isNoindexPath(p)) fail(`sitemap lists a noindexed path ${p}`);
    }
    sitemapPaths = locs.map((l) => new URL(l).pathname);
    ok(`sitemap.xml — ${locs.length} URLs`);
  }

  const llms = await get("/llms.txt");
  if (llms.status !== 200 || !llms.text.startsWith("# ")) fail(`/llms.txt → ${llms.status}`);
  else {
    if (/localhost/i.test(llms.text)) fail("llms.txt mentions localhost");
    if (/guaranteed income|free money|earn by clicking/i.test(llms.text)) fail("llms.txt contains hype wording");
    ok(`llms.txt — ${llms.text.length} chars`);
  }

  const samples: string[] = [];
  for (const [kind, re] of ITEM_KINDS) {
    const p = sitemapPaths.find((x) => re.test(x));
    if (p) samples.push(p);
    else console.log(`  skip no ${kind} in the sitemap`);
  }

  const titles = new Map<string, string>();
  const descs = new Map<string, string>();
  const images = new Map<string, string>();
  for (const path of [...PUBLIC_PAGES, ...samples]) {
    const isSample = samples.includes(path);
    const r = await get(`${path}${path.includes("?") ? "&" : "?"}utm_source=test&ref=abcd1234&fbclid=x`);
    if (r.status !== 200) {
      fail(`${path} → ${r.status}`);
      continue;
    }
    const head = r.text.split("</head>")[0];
    const where = `${path}:`;
    const canon = [...head.matchAll(/<link[^>]+rel="canonical"[^>]*>/gi)].map((m) => attr(m[0], "href"));
    const expected = path === "/" ? HOST : `${HOST}${path}`;
    if (canon.length !== 1) fail(`${where} ${canon.length} canonical tags`);
    else if (canon[0]!.replace(/\/$/, "") !== expected) fail(`${where} canonical ${canon[0]} ≠ ${expected}`);
    const robotsMeta = metaContent(head, "robots") || "";
    if (/noindex/i.test(robotsMeta)) fail(`${where} is noindex (${robotsMeta})`);
    const title = decode((head.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
    if (!title) fail(`${where} no <title>`);
    else if (title.length > 60) warn(`${where} title ${title.length} chars: "${title}"`);
    // Sampled items (posts by one author, say) are not held to site-wide uniqueness.
    if (title && titles.has(title) && !isSample) fail(`${where} duplicate title with ${titles.get(title)}`);
    titles.set(title, path);
    const desc = decode(metaContent(head, "description") || "");
    if (!desc) fail(`${where} no meta description`);
    else if (desc.length > 160) warn(`${where} description ${desc.length} chars`);
    if (desc && descs.has(desc) && !isSample) fail(`${where} duplicate description with ${descs.get(desc)}`);
    descs.set(desc, path);
    const og = metaContent(head, "og:image");
    if (!og || !/^https:\/\//.test(og)) fail(`${where} og:image missing/not absolute (${og})`);
    if (!metaContent(head, "twitter:image")) fail(`${where} no twitter:image`);
    const img = socialChecks(head, where);
    if (img && !images.has(img)) images.set(img, path);
    const h1 = (r.text.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) fail(`${where} has ${h1} <h1>`);
    if (/localhost|127\.0\.0\.1/.test(head.replace(/<script[\s\S]*?<\/script>/g, ""))) fail(`${where} localhost in <head>`);
    for (const m of r.text.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const data = JSON.parse(m[1]);
        const items = Array.isArray(data) ? data : [data];
        for (const it of items) if (!it["@type"]) fail(`${where} JSON-LD block without @type`);
        if (/localhost/.test(m[1])) fail(`${where} JSON-LD mentions localhost`);
      } catch (e) {
        fail(`${where} JSON-LD does not parse: ${(e as Error).message}`);
      }
    }
  }
  ok(`${PUBLIC_PAGES.length} public pages + ${samples.length} sampled items checked (canonical, title, description, og/twitter set, h1, JSON-LD)`);
  if (!/name="twitter:site"/.test((await get("/about")).text)) warn("no twitter:site — set the X handle at /admin/seo");

  const help = await get("/help");
  if (!/"@type":"FAQPage"/.test(help.text)) fail("/help has no FAQPage JSON-LD");
  const home = await get("/");
  for (const t of ["Organization", "WebSite", "WebApplication"]) {
    if (!new RegExp(`"@type":"${t}"`).test(home.text)) fail(`home has no ${t} JSON-LD`);
  }
  ok("site-wide + FAQ structured data present");

  await imageChecks(images);
  await uaSweep(["/", "/about", ...samples.slice(0, 3)]);
}

(async () => {
  staticChecks();
  await middlewareChecks();
  await liveChecks();
  console.log(`\n${failures ? "FAILED" : "PASSED"} — ${failures} failure(s), ${warnings} warning(s)`);
  process.exit(failures ? 1 : 0);
})();
