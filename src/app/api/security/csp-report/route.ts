import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Collector for Content-Security-Policy violation reports.
 *
 * The policy is sent as `Content-Security-Policy-Report-Only` (see
 * next.config.ts), so nothing is blocked — browsers only tell us what WOULD
 * have been blocked. That is how the owner learns which hosts the site really
 * loads before ever enforcing a policy.
 *
 * Deliberately cheap and quiet:
 *  - no database at all — a page with one violation reports it on every view,
 *    and writing a row per report would be a self-inflicted flood;
 *  - counts are aggregated in memory per (directive, blocked host) and only
 *    logged the 1st, 10th, 100th, 1000th… time a key is seen, so the log shows
 *    what is happening without repeating it;
 *  - per-IP speed bump, and the body is capped.
 *
 * Accepts both formats browsers send: the legacy `report-uri` body
 * (`application/csp-report`, `{ "csp-report": {…} }`) and the Reporting API
 * (`application/reports+json`, an array of `{ type, body }`).
 *
 * Public on purpose (listed in publicApiPrefixes in lib/auth/config.ts):
 * browsers send reports without cookies.
 */

const MAX_BODY = 16 * 1024;
const MAX_KEYS = 500;
const counts = new Map<string, number>();

type Violation = { directive: string; blocked: string; page: string };

function hostOf(u: unknown): string {
  if (typeof u !== "string" || !u) return "(none)";
  // Keywords browsers use instead of a URL: inline, eval, data, blob, wasm-eval…
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u.slice(0, 40);
  try {
    return new URL(u).host;
  } catch {
    return "(bad-url)";
  }
}

function pathOf(u: unknown): string {
  if (typeof u !== "string") return "";
  try {
    return new URL(u).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

function pick(r: Record<string, unknown>): Violation {
  const directive = String(
    r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective ?? "?"
  ).split(" ")[0]!.slice(0, 40);
  return {
    directive,
    blocked: hostOf(r["blocked-uri"] ?? r.blockedURL),
    page: pathOf(r["document-uri"] ?? r.documentURL),
  };
}

function record(v: Violation) {
  const key = `${v.directive} ${v.blocked}`;
  if (!counts.has(key) && counts.size >= MAX_KEYS) return;
  const n = (counts.get(key) ?? 0) + 1;
  counts.set(key, n);
  // 1, 10, 100, 1000… — enough to see the shape without log spam.
  if (/^10*$/.test(String(n))) {
    console.warn(`[csp-report] ${key} ×${n} (e.g. ${v.page || "?"})`);
  }
}

export async function POST(req: NextRequest) {
  const { ok } = rateLimit(`csp-report:${clientIp(req)}`, 30, 60_000);
  if (!ok) return new NextResponse(null, { status: 204 });

  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY) return new NextResponse(null, { status: 204 });
    const data: unknown = JSON.parse(text);

    if (Array.isArray(data)) {
      for (const item of data.slice(0, 20)) {
        if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
          const body = (item as { body?: unknown }).body;
          if (body && typeof body === "object") record(pick(body as Record<string, unknown>));
        }
      }
    } else if (data && typeof data === "object" && "csp-report" in data) {
      const r = (data as { "csp-report": unknown })["csp-report"];
      if (r && typeof r === "object") record(pick(r as Record<string, unknown>));
    }
  } catch {
    // Malformed report — ignore. A collector must never error back.
  }
  return new NextResponse(null, { status: 204 });
}
