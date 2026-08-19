import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ipSubject, recordImpression, recordClick } from "@/lib/ad-events";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * Unified ad-engagement endpoint. The web client posts here (via the neutral
 * `/api/spaces/:id/event` rewrite) instead of the legacy `/click` + `/impression`
 * paths — neither the URL nor the body contains an ad-blocker filter token.
 *
 * Body: `{ kind: "view" | "open" }`  (view = impression, open = click).
 *
 * Views used to be recorded with no auth, no dedup and no rate limit, so anyone
 * could inflate their own ad's impressions or tank a rival's CTR in a loop. Now
 * every view is attributed to a subject (user, else hashed IP), deduped per
 * minute in the DB, and rate limited per IP.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const kind = (body as { kind?: string }).kind;

  if (kind === "view") {
    const limited = enforceRateLimit(request, "ad-view", 60, 60_000);
    if (limited) return limited;

    const session = await auth();
    const userId = session?.user?.id ?? null;
    const { counted } = await recordImpression(id, {
      subject: userId ?? ipSubject(clientIp(request)),
      userId,
    });
    return NextResponse.json({ success: true, counted });
  }

  if (kind === "open") {
    // Only logged-in users can bill a click (ads are served to authed users).
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, billed: false });
    }
    const limited = enforceRateLimit(request, "ad-click", 30, 60_000);
    if (limited) return limited;

    const { billed } = await recordClick(id, session.user.id);
    return NextResponse.json({ success: true, billed });
  }

  return NextResponse.json({ error: "bad kind" }, { status: 400 });
}
