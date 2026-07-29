import { NextRequest, NextResponse } from "next/server";
import { recordImpression } from "@/lib/ad-events";

/**
 * Records an ad impression (fire-and-forget). Legacy path kept for back-compat
 * (e.g. mobile clients); the web client now posts to `/api/spaces/:id/event`.
 * Delegates to the shared recorder so counting logic lives in one place.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await recordImpression(id);
  return NextResponse.json({ success: true });
}
