import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSetting } from "@/lib/system-settings";
import { recordPageEvent, visitorHashFrom } from "@/lib/page-analytics";
import { kickScheduler } from "@/lib/scheduler/run";
import { realIp } from "@/lib/client-ip";

// Cheap bot filter — skip obvious crawlers so traffic reflects real visitors.
const BOT_RE = /bot|crawl|spider|slurp|bing|baidu|yandex|duckduck|facebookexternalhit|embedly|preview|lighthouse|headless|monitor|pingdom|uptime/i;

// POST /api/analytics/pageview — record a page/task-page traffic event.
// Body: { path: string, view?: boolean, dwellMs?: number }
// The client sends only the path + timing; the server resolves the visitor
// (auth cookie, else hashed ip+ua) and never blocks navigation on failure.
export async function POST(request: NextRequest) {
  try {
    // Second trigger for the traffic-driven scheduler. The root layout covers
    // rendered pages; this beacon fires on EVERY page view including ones
    // served straight from the CDN, where no server render happens at all. It
    // queues work for after this response and cannot slow the beacon down.
    kickScheduler();

    const enabled = await getSetting<boolean>("analytics_pageviews_enabled", true);
    if (enabled === false) return new NextResponse(null, { status: 204 });

    const ua = request.headers.get("user-agent") ?? "";
    if (BOT_RE.test(ua)) return new NextResponse(null, { status: 204 });

    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      view?: boolean;
      dwellMs?: number;
    };
    if (!body.path || typeof body.path !== "string") {
      return new NextResponse(null, { status: 204 });
    }

    const session = await auth();
    const ip = realIp(request.headers) ?? "anon";
    const visitorHash = visitorHashFrom(session?.user?.id ?? null, ip, ua);

    await recordPageEvent({
      path: body.path,
      view: body.view === true,
      dwellSec: Math.floor((body.dwellMs ?? 0) / 1000),
      visitorHash,
    });
  } catch {
    /* analytics must never break navigation */
  }
  return new NextResponse(null, { status: 204 });
}
