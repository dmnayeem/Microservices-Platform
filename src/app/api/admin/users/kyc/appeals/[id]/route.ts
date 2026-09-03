import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const v = reviewSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const requiredPerm =
    v.data.action === "approve" ? "kyc.approve" : "kyc.reject";
  if (!(await can(session.user.id, requiredPerm))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appeal = await prisma.kYCAppeal.findUnique({
    where: { id },
    include: {
      kycDocument: { select: { id: true, userId: true } },
    },
  });
  if (!appeal) {
    return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
  }
  if (appeal.status !== "PENDING") {
    return NextResponse.json(
      { error: `Appeal is already ${appeal.status.toLowerCase()}` },
      { status: 400 }
    );
  }

  const newStatus = v.data.action === "approve" ? "APPROVED" : "REJECTED";

  await prisma.$transaction(async (tx) => {
    await tx.kYCAppeal.update({
      where: { id },
      data: {
        status: newStatus,
        adminNote: v.data.adminNote ?? null,
        reviewedById: session.user!.id,
        reviewedAt: new Date(),
      },
    });

    // If approved, mark the original KYC doc + user as APPROVED
    if (v.data.action === "approve") {
      await tx.kYCDocument.update({
        where: { id: appeal.kycDocumentId },
        data: {
          status: "APPROVED",
          reviewedBy: session.user!.id,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      await tx.user.update({
        where: { id: appeal.userId },
        data: { kycStatus: "APPROVED" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.user!.id,
        action: v.data.action === "approve" ? "KYC_APPEAL_APPROVED" : "KYC_APPEAL_REJECTED",
        entity: "KYCAppeal",
        entityId: id,
        targetUserId: appeal.userId,
        summary: `${v.data.action === "approve" ? "Approved" : "Rejected"} a KYC appeal${v.data.adminNote ? ` — ${v.data.adminNote}` : ""}`,
        newData: { adminNote: v.data.adminNote ?? null },
      },
    });
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
