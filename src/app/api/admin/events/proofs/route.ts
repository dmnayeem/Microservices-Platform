import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { reviewEventProof } from "@/lib/events";

// GET /api/admin/events/proofs?status=PENDING — UPLOAD_PROOF submissions to review.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "events.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const raw = (request.nextUrl.searchParams.get("status") ?? "PENDING").toUpperCase();
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(raw) ? raw : "PENDING";
  const rows = await prisma.userEventProgress.findMany({
    where: { proofStatus: status, event: { actionType: "UPLOAD_PROOF" } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: {
      userId: true,
      eventId: true,
      proofUrl: true,
      proofStatus: true,
      proofNote: true,
      proofReviewedAt: true,
      updatedAt: true,
      user: { select: { name: true, email: true, username: true } },
      event: { select: { title: true, rewardPoints: true, rewardXp: true, endAt: true } },
    },
  });
  return NextResponse.json({ proofs: rows });
}

// POST /api/admin/events/proofs { eventId, userId, action: "approve"|"reject", note? }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "events.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = (await request.json().catch(() => ({}))) as {
    eventId?: unknown;
    userId?: unknown;
    action?: unknown;
    note?: unknown;
  };
  if (typeof b.eventId !== "string" || typeof b.userId !== "string" || (b.action !== "approve" && b.action !== "reject")) {
    return NextResponse.json({ error: "eventId, userId and action (approve|reject) are required" }, { status: 400 });
  }
  const note = typeof b.note === "string" ? b.note : null;
  if (b.action === "reject" && !note?.trim()) {
    return NextResponse.json({ error: "Give the user a reason for the rejection." }, { status: 400 });
  }
  const r = await reviewEventProof(session.user.id, b.eventId, b.userId, b.action === "approve", note);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
