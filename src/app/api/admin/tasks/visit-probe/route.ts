import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAny } from "@/lib/permissions";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { probeEmbed } from "@/lib/embed-probe";

/**
 * POST /api/admin/tasks/visit-probe { url } — "Test this link" in the Visit
 * task builder: can this link be shown inside RevType's in-app viewer?
 *
 * Reads the framing headers (X-Frame-Options / CSP frame-ancestors) of the
 * page the link ends on, server-side (lib/embed-probe.ts, the games check;
 * redirects are followed, as a smart link's would be). Advisory: a pass is not
 * a guarantee, which is why the viewer also has a new-tab fallback.
 *
 * Admin-only and rate limited: it makes the server fetch an admin-typed URL.
 * Returns { ok, reason?, status?, xfo?, csp?, checkedAt }.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (
    !session?.user?.id ||
    !(await canAny(session.user.id, ["tasks.create", "tasks.create.visit", "tasks.edit"]))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await enforceDbRateLimit(request, "visit-probe", session.user.id, 20, 60_000);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Add the link first." }, { status: 400 });
  if (/^http:\/\//i.test(url)) {
    return NextResponse.json({
      ok: false,
      reason: "This is an http link — an http page can't be shown inside RevType (https only).",
      checkedAt: new Date().toISOString(),
    });
  }

  const result = await probeEmbed(url);
  // The shared probe was written for games; word its reasons for a link.
  if (result.reason) {
    result.reason = result.reason.replace(/\bthe game URL\b/gi, "the link").replace(/\bGames must\b/, "Links must");
  }
  return NextResponse.json(result);
}
