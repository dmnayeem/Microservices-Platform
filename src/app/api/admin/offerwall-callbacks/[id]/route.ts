import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !(await can(session.user.id, "offerwalls.manage"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const { action, note } = v.data;
  if (action === "REJECT" && !note?.trim()) {
    return NextResponse.json(
      { error: "Review note required for rejection" },
      { status: 400 }
    );
  }

  const callback = await prisma.offerwallCallback.findUnique({ where: { id } });
  if (!callback)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (callback.status !== "PENDING") {
    return NextResponse.json(
      { error: "Already reviewed" },
      { status: 409 }
    );
  }

  if (action === "APPROVE") {
    // Credit user, mark approved
    await prisma.$transaction([
      prisma.offerwallCallback.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: session.user.id,
          reviewNote: note ?? null,
          processedAt: new Date(),
          creditedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: callback.userId },
        data: {
          pointsBalance: { increment: callback.userPayout },
          totalEarnings: { increment: callback.payoutAmount },
        },
      }),
      prisma.transaction.create({
        data: {
          userId: callback.userId,
          type: "EARNING",
          status: "COMPLETED",
          points: callback.userPayout,
          amount: callback.payoutAmount,
          description: `Offerwall: ${callback.offerName ?? callback.offerId ?? "completion"}`,
          reference: callback.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "OFFERWALL_CALLBACK_APPROVED",
          entity: "OfferwallCallback",
          entityId: id,
          newData: {
            credited: callback.userPayout,
            transactionId: callback.transactionId,
          },
        },
      }),
    ]);
  } else {
    await prisma.offerwallCallback.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: session.user.id,
        reviewNote: note ?? null,
        rejectionReason: note ?? null,
        processedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "OFFERWALL_CALLBACK_REJECTED",
        entity: "OfferwallCallback",
        entityId: id,
        newData: { reason: note },
      },
    });
  }

  return NextResponse.json({ success: true });
}
