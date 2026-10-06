import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveEventCountry } from "@/lib/ad-geo";
import { ingestAdEvent } from "@/lib/ad-measure";
import { parseSignalsBody } from "@/lib/ad-ivt";

/**
 * LEGACY click endpoint. Routes into the same measured-click ingestion as the
 * `/api/spaces/go` redirect (src/lib/ad-measure.ts) — serve token required,
 * single-use per delivery, IVT-judged. Serve token from the body or `?st=`.
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "ad-click", 30, 60_000);
  if (limited) return limited;

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const body = (await request.json().catch(() => ({}))) as { st?: unknown; sg?: unknown };
  const country = await resolveEventCountry({ userId }).catch(() => null);
  const r = await ingestAdEvent({
    st: body.st ?? request.nextUrl.searchParams.get("st"),
    kind: "CLICK",
    signals: parseSignalsBody(body.sg),
    headers: request.headers,
    sessionUserId: userId,
    country,
  });
  return NextResponse.json({ success: true, billed: r.billed });
}
