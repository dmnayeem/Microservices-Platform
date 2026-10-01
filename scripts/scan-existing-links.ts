import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  checkUrls,
  extractUrls,
  extractUrlsFromHtml,
  normaliseDomainList,
  normaliseMode,
  stringsIn,
  type LinkSafetyConfig,
  type LinkVerdict,
} from "../src/lib/link-safety";

/**
 * Scan links ALREADY saved on the platform with the same rules new content
 * now goes through (src/lib/link-safety.ts).
 *
 * READ-ONLY. Dry run by default: prints how many links each kind of content
 * holds and every link that would be refused or flagged today.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/scan-existing-links.ts
 *   npx tsx --tsconfig tsconfig.script.json scripts/scan-existing-links.ts --signal
 *
 * `--signal` additionally raises a LINK_UNSAFE abuse signal for every flagged
 * item, so each becomes a case in the Abuse Center. It changes nothing else —
 * no content is edited, hidden or deleted.
 *
 * Also answers "does any existing flow store javascript:/data:/file: links?":
 * the "hard" count per table is exactly that.
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

const SIGNAL = process.argv.includes("--signal");
const BATCH = 500;

interface Item {
  id: string;
  userId: string | null;
  urls: string[];
}

interface Source {
  table: string;
  entityType: string;
  load: (cursor: string | null) => Promise<Item[]>;
}

const page = (cursor: string | null) => ({
  take: BATCH,
  ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  orderBy: { id: "asc" as const },
});

const SOURCES: Source[] = [
  {
    table: "Post",
    entityType: "post",
    load: async (c) =>
      (
        await prisma.post.findMany({
          ...page(c),
          select: { id: true, userId: true, content: true },
        })
      ).map((r) => ({ id: r.id, userId: r.userId, urls: extractUrls(r.content) })),
  },
  {
    table: "Comment",
    entityType: "comment",
    load: async (c) =>
      (
        await prisma.comment.findMany({
          ...page(c),
          select: { id: true, userId: true, content: true },
        })
      ).map((r) => ({ id: r.id, userId: r.userId, urls: extractUrls(r.content) })),
  },
  {
    table: "User.bio",
    entityType: "profile",
    load: async (c) =>
      (
        await prisma.user.findMany({
          ...page(c),
          where: { bio: { not: null } },
          select: { id: true, bio: true },
        })
      ).map((r) => ({ id: r.id, userId: r.id, urls: extractUrls(r.bio) })),
  },
  {
    table: "SocialAccount.url",
    entityType: "profile",
    load: async (c) =>
      (
        await prisma.socialAccount.findMany({
          ...page(c),
          select: { id: true, userId: true, url: true },
        })
      ).map((r) => ({ id: r.id, userId: r.userId, urls: r.url ? [r.url] : [] })),
  },
  {
    table: "Group",
    entityType: "group",
    load: async (c) =>
      (
        await prisma.group.findMany({
          ...page(c),
          select: { id: true, ownerId: true, name: true, description: true },
        })
      ).map((r) => ({
        id: r.id,
        userId: r.ownerId,
        urls: [...extractUrls(r.name), ...extractUrls(r.description)],
      })),
  },
  {
    table: "MarketplaceListing",
    entityType: "listing",
    load: async (c) =>
      (
        await prisma.marketplaceListing.findMany({
          ...page(c),
          select: {
            id: true,
            sellerId: true,
            title: true,
            description: true,
            richDescription: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        userId: r.sellerId,
        urls: [
          ...extractUrls(r.title),
          ...extractUrls(r.description),
          ...extractUrlsFromHtml(r.richDescription),
        ],
      })),
  },
  {
    table: "Task",
    entityType: "task",
    load: async (c) =>
      (
        await prisma.task.findMany({
          ...page(c),
          select: {
            id: true,
            createdById: true,
            title: true,
            description: true,
            instructions: true,
            socialUrl: true,
            contentUrl: true,
            articleConfig: true,
            customConfig: true,
          },
        })
      ).map((r) => ({
        id: r.id,
        userId: r.createdById,
        urls: [
          ...[r.title, r.description, r.instructions]
            .concat(stringsIn([r.articleConfig, r.customConfig]))
            .flatMap((t) => extractUrls(t)),
          ...(r.socialUrl ? [r.socialUrl] : []),
          // contentUrl is sometimes an uploaded file key, not a link.
          ...(r.contentUrl && /^[a-z][a-z0-9+.-]*:/i.test(r.contentUrl) ? [r.contentUrl] : []),
        ],
      })),
  },
  {
    table: "Ad",
    entityType: "ad",
    load: async (c) =>
      (
        await prisma.ad.findMany({
          ...page(c),
          select: { id: true, submittedById: true, targetUrl: true, headline: true },
        })
      ).map((r) => ({
        id: r.id,
        userId: r.submittedById,
        urls: [...(r.targetUrl ? [r.targetUrl] : []), ...extractUrls(r.headline)],
      })),
  },
  {
    table: "CpaOffer",
    entityType: "cpa",
    load: async (c) =>
      (
        await prisma.cpaOffer.findMany({
          ...page(c),
          select: { id: true, createdById: true, trackingUrl: true },
        })
      ).map((r) => ({ id: r.id, userId: r.createdById, urls: [r.trackingUrl] })),
  },
  {
    table: "ChatMessage",
    entityType: "chat",
    load: async (c) =>
      (
        await prisma.chatMessage.findMany({
          ...page(c),
          select: { id: true, senderId: true, content: true },
        })
      ).map((r) => ({ id: r.id, userId: r.senderId, urls: extractUrls(r.content) })),
  },
];

async function loadConfig(): Promise<LinkSafetyConfig> {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          "security.link_policy",
          "security.blocked_domains",
          "security.safe_browsing_api_key",
        ],
      },
    },
    select: { key: true, value: true },
  });
  const get = (k: string) => {
    const v = rows.find((r) => r.key === k)?.value as unknown;
    return v && typeof v === "object" && !Array.isArray(v) && "v" in (v as object)
      ? (v as { v: unknown }).v
      : v;
  };
  const key = process.env.GOOGLE_SAFE_BROWSING_KEY || get("security.safe_browsing_api_key");
  // The scan reports on every layer even when the live mode is "off", so the
  // owner sees what switching it on would find.
  const mode = normaliseMode(get("security.link_policy"));
  return {
    mode: mode === "off" ? "flag" : mode,
    blockedDomains: normaliseDomainList(get("security.blocked_domains")),
    safeBrowsingKey: typeof key === "string" ? key.trim() : "",
  };
}

async function main() {
  const cfg = await loadConfig();
  console.log(
    `Link scan (${SIGNAL ? "RAISING SIGNALS" : "dry run"}) — ${cfg.blockedDomains.length} blocked domain(s), Safe Browsing ${cfg.safeBrowsingKey ? "ON" : "off (no key)"}\n`
  );

  const summary: { table: string; rows: number; withLinks: number; links: number; hard: number; unsafe: number; suspicious: number }[] = [];
  const findings: { table: string; entityType: string; id: string; userId: string | null; verdicts: LinkVerdict[] }[] = [];

  for (const src of SOURCES) {
    const s = { table: src.table, rows: 0, withLinks: 0, links: 0, hard: 0, unsafe: 0, suspicious: 0 };
    let cursor: string | null = null;
    for (;;) {
      let items: Item[];
      try {
        items = await src.load(cursor);
      } catch (e) {
        console.error(`  ${src.table}: read failed — ${(e as Error).message.split("\n")[0]}`);
        break;
      }
      if (items.length === 0) break;
      cursor = items[items.length - 1].id;
      s.rows += items.length;
      for (const it of items) {
        if (it.urls.length === 0) continue;
        s.withLinks++;
        const verdicts = await checkUrls(it.urls, { config: cfg });
        s.links += verdicts.length;
        const bad = verdicts.filter((v) => v.status !== "ok");
        for (const v of bad) s[v.status as "hard" | "unsafe" | "suspicious"]++;
        if (bad.length > 0) {
          findings.push({ table: src.table, entityType: src.entityType, id: it.id, userId: it.userId, verdicts: bad });
        }
      }
      if (items.length < BATCH) break;
    }
    summary.push(s);
  }

  console.table(summary);
  if (findings.length === 0) {
    console.log("\nNothing flagged.");
  } else {
    console.log(`\n${findings.length} item(s) flagged:\n`);
    for (const f of findings) {
      for (const v of f.verdicts) {
        console.log(
          `  [${v.status}] ${f.table} ${f.id} (user ${f.userId ?? "-"}) ${v.url.slice(0, 120)}\n      ${v.reasons.join("; ")}`
        );
      }
    }
  }

  if (SIGNAL && findings.length > 0) {
    const { raiseAbuseSignal } = await import("../src/lib/abuse/signal");
    for (const f of findings) {
      raiseAbuseSignal({
        kind: "LINK_UNSAFE",
        severity: f.verdicts.some((v) => v.status === "unsafe")
          ? "HIGH"
          : f.verdicts.some((v) => v.status === "hard")
            ? "MEDIUM"
            : "LOW",
        userId: f.userId,
        entityType: f.entityType,
        entityId: f.id,
        summary: `Existing ${f.entityType} holds ${f.verdicts.length === 1 ? "an unsafe link" : `${f.verdicts.length} unsafe links`}: ${f.verdicts[0].host ?? f.verdicts[0].url.slice(0, 80)} — ${f.verdicts[0].reasons[0] ?? ""}`,
        evidence: {
          source: "scan-existing-links",
          links: f.verdicts.map((v) => ({ url: v.url.slice(0, 500), status: v.status, reasons: v.reasons, threats: v.threats ?? [] })),
        },
      });
    }
    // raiseAbuseSignal is fire-and-forget; give the writes time to land.
    await new Promise((r) => setTimeout(r, 5000));
    console.log(`\nRaised ${findings.length} signal(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
