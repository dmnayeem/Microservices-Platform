import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  checkUrls,
  extractUrls,
  loadLinkSafetyConfig,
  refuses,
} from "@/lib/link-safety";
import { z } from "zod";

/**
 * "Test a URL" on Settings → Security → Link safety.
 *
 * Runs the exact check a user's post goes through, against the SAVED settings,
 * and says what would happen. Raises no abuse signal — it is a test.
 */
export const runtime = "nodejs";

const schema = z.object({ url: z.string().trim().min(1).max(2048) });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: "Paste a link to test" }, { status: 400 });
  }

  const cfg = await loadLinkSafetyConfig();
  // A bare "example.com" is tested the way a post would read it.
  const raw = v.data.url;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : (extractUrls(raw)[0] ?? raw);
  const [verdict] = await checkUrls([url], { config: cfg });

  const outcome = !verdict
    ? "allowed"
    : refuses(verdict, cfg.mode, "full")
      ? "blocked"
      : verdict.status === "ok"
        ? "allowed"
        : "flagged";

  return NextResponse.json({
    url,
    outcome,
    status: verdict?.status ?? "ok",
    reasons: verdict?.reasons ?? [],
    threats: verdict?.threats ?? [],
    mode: cfg.mode,
    safeBrowsing: cfg.safeBrowsingKey ? "on" : "off",
    blockedDomains: cfg.blockedDomains.length,
  });
}
