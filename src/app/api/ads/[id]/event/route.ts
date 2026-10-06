import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ipSubject, recordImpression } from "@/lib/ad-events";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { resolveEventCountry } from "@/lib/ad-geo";
import { ingestAdEvent } from "@/lib/ad-measure";
import { parseSignalsBody } from "@/lib/ad-ivt";

/**
 * LEGACY ad-engagement endpoint (`/api/spaces/:id/event`).
 *
 * The web client no longer calls this: viewable impressions go to
 * `/api/spaces/m` and clicks through the `/api/spaces/go` redirect (see
 * src/lib/ad-measure.ts). It stays for older clients, and routes into the SAME
 * ingestion, so nothing here can count or bill on a different basis:
 *
 *  - `view` with a serve token → a measured view (judged by the IVT rules; a
 *    caller that sends no page signals is recorded as invalid);
 *    without one → the old per-minute `AdEngagement` row only, counting nothing.
 *  - `open` → a measured click, single-use per delivery.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { kind?: string; st?: unknown; sg?: unknown };
  const kind = body.kind;
  if (kind !== "view" && kind !== "open") {
    return NextResponse.json({ error: "bad kind" }, { status: 400 });
  }

  const limited = enforceRateLimit(request, kind === "view" ? "ad-view" : "ad-click", kind === "view" ? 60 : 30, 60_000);
  if (limited) return limited;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (kind === "view" && !body.st) {
    const { counted } = await recordImpression(id, {
      subject: userId ?? ipSubject(clientIp(request)),
      userId,
    });
    return NextResponse.json({ success: true, counted });
  }

  const country = await resolveEventCountry({ userId }).catch(() => null);
  const r = await ingestAdEvent({
    st: body.st,
    kind: kind === "view" ? "VIEW" : "CLICK",
    signals: parseSignalsBody(body.sg),
    headers: request.headers,
    sessionUserId: userId,
    country,
  });
  return NextResponse.json({ success: true, counted: r.counted && r.valid, billed: r.billed });
}
