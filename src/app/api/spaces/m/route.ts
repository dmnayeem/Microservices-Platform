import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveEventCountry } from "@/lib/ad-geo";
import { ingestAdEvent } from "@/lib/ad-measure";
import { parseSignalsBody, type MeasureKind } from "@/lib/ad-ivt";

/**
 * Ad measurement beacon (neutral path — no ad-blocker filter token).
 *
 * Body (sent with navigator.sendBeacon, so it may arrive as text/plain):
 *   { st, kind: "view" | "est_click" | "script_exec", sg: ClientSignals }
 *
 * Public on purpose (see `publicApiPrefixes` in auth/config.ts): logged-out
 * visitors see ads too, and their impressions are real. Nothing here trusts the
 * caller — the serve token is HMAC-signed and single-use, and every event is
 * judged by the IVT rules and stored with its verdict.
 */
const KINDS: Record<string, MeasureKind> = {
  view: "VIEW",
  est_click: "EST_CLICK",
  script_exec: "SCRIPT_EXEC",
};

export async function POST(request: NextRequest) {
  // In-memory, per IP: a runaway loop or a flood cannot become a write storm.
  const limited = enforceRateLimit(request, "ad-measure", 300, 60_000);
  if (limited) return limited;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length > 4096) return new NextResponse(null, { status: 413 });
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const kind = KINDS[String(body.kind ?? "")];
  if (!kind) return new NextResponse(null, { status: 400 });

  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? null;
  const country = await resolveEventCountry({ userId }).catch(() => null);

  await ingestAdEvent({
    st: body.st,
    kind,
    signals: parseSignalsBody(body.sg),
    headers: request.headers,
    sessionUserId: userId,
    country,
  });
  // The verdict is not echoed: a bot tuning itself against the rules should
  // learn nothing from the response.
  return new NextResponse(null, { status: 204 });
}
