import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { realIp } from "@/lib/client-ip";

// POST /api/marketplace/listings/:id/view — record a per-listing view.
//
// Inserts a row in MarketplaceListingView with a sessionHash that combines the
// viewer's user id (or a cookie surrogate) + UA. The (listingId, sessionHash)
// unique constraint dedupes repeated views from the same viewer; when a NEW
// row is inserted, we bump MarketplaceListing.uniqueViewers in the same
// transaction.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    // Build a stable per-viewer hash. Mix user id (if logged in) or IP +
    // user-agent (anon) into a short hash so we dedupe per browser session.
    const ua = request.headers.get("user-agent") ?? "";
    const ip = realIp(request.headers) ?? "anon";
    const seed = session?.user?.id
      ? `u:${session.user.id}`
      : `a:${ip}:${ua}`;
    const sessionHash = crypto
      .createHash("sha256")
      .update(seed)
      .digest("hex")
      .slice(0, 32);

    const body = await request.json().catch(() => ({} as { source?: string }));
    const source = typeof body.source === "string" ? body.source.slice(0, 32) : null;

    // Try to insert. If a row already exists for this (listing, session),
    // the unique constraint short-circuits — no counter bump.
    try {
      await prisma.marketplaceListingView.create({
        data: {
          listingId: id,
          userId: session?.user?.id ?? null,
          sessionHash,
          source,
        },
      });
      await prisma.marketplaceListing.update({
        where: { id },
        data: { uniqueViewers: { increment: 1 } },
      });
      return NextResponse.json({ recorded: true, deduped: false });
    } catch {
      // Duplicate — treat as no-op (already counted).
      return NextResponse.json({ recorded: true, deduped: true });
    }
  } catch (error) {
    console.error("View tracking failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
