import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { todayUtc } from "@/lib/ad-stats";

// Parent segments whose child is a dynamic (non-id-like) slug we still want to
// collapse to `[id]` so the rollup doesn't explode per-slug. (Id-like children —
// cuids/uuids/numbers — are caught by isIdLike regardless of parent.)
const DYNAMIC_PARENTS = new Set([
  "courses",
  "hashtag",
  "u",
  "groups",
  "learn",
  "certificates",
]);

// The six task types that have a per-id URL (others are list pages).
const TASK_ROUTE_RE = /^\/(video|article|survey|custom|app-install|social)-tasks\/([^/?#]+)/;
const TASK_TYPE: Record<string, string> = {
  video: "VIDEO",
  article: "ARTICLE",
  survey: "SURVEY",
  custom: "CUSTOM",
  "app-install": "APPINSTALL",
  social: "SOCIAL",
};

/** Heuristic: does a path segment look like a generated id (cuid/uuid/number/token)? */
function isIdLike(s: string): boolean {
  if (/^\d+$/.test(s)) return true; // all digits
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(s)) return true; // uuid
  if (/^c[a-z0-9]{20,}$/i.test(s)) return true; // cuid
  if (s.length >= 20 && /\d/.test(s) && /^[a-z0-9_-]+$/i.test(s)) return true; // long token
  return false;
}

/**
 * Collapse a raw pathname into a stable route template for page-wise rollups:
 * strips query/hash + trailing slash, drops non-page paths (api/_next/assets),
 * replaces id-like segments (and slug children of known dynamic parents) with
 * `[id]`, and caps depth to bound cardinality. Returns null for paths we skip.
 */
export function normalizePath(raw: string): string | null {
  let p = (raw || "/").split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p === "") p = "/";
  if (p.startsWith("/api") || p.startsWith("/_next") || /\.[a-z0-9]{2,5}$/i.test(p)) {
    return null;
  }
  const segs = p.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const parent = i > 0 ? segs[i - 1] : null;
    out.push(isIdLike(s) || (parent && DYNAMIC_PARENTS.has(parent)) ? "[id]" : s);
  }
  const capped = out.slice(0, 4);
  return capped.length ? "/" + capped.join("/") : "/";
}

/** If the path is a per-id task page, return its type + id; else null. */
export function detectTaskPage(raw: string): { type: string; id: string } | null {
  const m = TASK_ROUTE_RE.exec((raw || "").split("?")[0]);
  if (!m) return null;
  const id = m[2];
  if (!isIdLike(id)) return null; // e.g. /article-tasks/complete
  return { type: TASK_TYPE[m[1]], id };
}

/** One-way per-visitor hash: user id when logged in, else ip+ua for anon. */
export function visitorHashFrom(userId: string | null, ip: string, ua: string): string {
  const seed = userId ? `u:${userId}` : `a:${ip}:${ua}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

interface PageEvent {
  path: string;
  view: boolean; // true on entry (count a view + unique), false for dwell-only
  dwellSec: number;
  visitorHash: string;
}

/**
 * Record a page/task-page traffic event into the daily rollup. Best-effort —
 * never throws (analytics must not break navigation). Mirrors bumpAdDailyStat:
 * upsert-increment the rollup, and on a view try-insert the dedup row to bump
 * uniqueVisitors exactly once per (kind,key,date,visitor).
 */
export async function recordPageEvent(evt: PageEvent): Promise<void> {
  const pageKey = normalizePath(evt.path);
  if (!pageKey) return;

  const date = todayUtc();
  const dwell = Math.max(0, Math.min(Math.floor(evt.dwellSec || 0), 1800));
  const viewInc = evt.view ? 1 : 0;

  const targets: { kind: string; key: string; label: string | null }[] = [
    { kind: "PAGE", key: pageKey, label: null },
  ];
  const task = detectTaskPage(evt.path);
  if (task) targets.push({ kind: "TASK", key: task.id, label: task.type });

  for (const t of targets) {
    try {
      await prisma.pageDailyStat.upsert({
        where: { kind_key_date: { kind: t.kind, key: t.key, date } },
        create: {
          date,
          kind: t.kind,
          key: t.key,
          label: t.label,
          views: viewInc,
          totalDwellSec: dwell,
          uniqueVisitors: 0,
        },
        update: {
          views: { increment: viewInc },
          totalDwellSec: { increment: dwell },
          ...(t.label ? { label: t.label } : {}),
        },
      });

      if (evt.view) {
        try {
          await prisma.pageVisitDaily.create({
            data: { kind: t.kind, key: t.key, date, visitorHash: evt.visitorHash },
          });
          await prisma.pageDailyStat.update({
            where: { kind_key_date: { kind: t.kind, key: t.key, date } },
            data: { uniqueVisitors: { increment: 1 } },
          });
        } catch {
          /* duplicate visitor for the day — already counted */
        }
      }
    } catch {
      /* rollup is non-critical */
    }
  }
}
