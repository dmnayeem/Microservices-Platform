import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ipSubject, recordImpression } from "@/lib/ad-events";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";

/**
 * Records an ad impression. Legacy path kept for back-compat (e.g. mobile
 * clients); the web client now posts to `/api/spaces/:id/event`. Delegates to
 * the shared recorder so counting — and its dedup/rate-limit guards — live in
 * one place.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "ad-view", 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const { counted } = await recordImpression(id, {
    subject: userId ?? ipSubject(clientIp(request)),
    userId,
  });
  return NextResponse.json({ success: true, counted });
}
