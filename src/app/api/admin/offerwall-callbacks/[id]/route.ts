import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getPointsPerUsd } from "@/lib/economy";
import { releaseHeldCompletion } from "@/lib/offerwall";

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
    // A callback carrying an `internalOfferId` is a CATALOG completion that was
    // held. Its money belongs to `releaseHeldCompletion()`, which the hold cron
    // also calls — one status CAS, one ledger reference, so approving here and
    // the cron firing cannot both pay. Crediting it inline (as this route used
    // to) wrote a second ledger row under the callback's own id, which the
    // unique constraint could not match against the cron's, and the user was
    // paid twice for one offer.
    if (callback.internalOfferId) {
      const completion = await prisma.offerwallCompletion.findFirst({
        where: {
          offerId: callback.internalOfferId,
          userId: callback.userId,
          ...(callback.transactionId ? { txid: callback.transactionId } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });

      const credited = completion
        ? await releaseHeldCompletion(completion.id)
        : false;

      await prisma.offerwallCallback.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: session.user.id,
          reviewNote: note ?? null,
          processedAt: new Date(),
          creditedAt: credited ? new Date() : null,
        },
      });
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "OFFERWALL_CALLBACK_APPROVED",
          entity: "OfferwallCallback",
          entityId: id,
          newData: {
            releasedEarly: credited,
            completionId: completion?.id ?? null,
            completionStatus: completion?.status ?? null,
            transactionId: callback.transactionId,
          },
        },
      });

      return NextResponse.json({
        success: true,
        credited,
        message: credited
          ? "Hold released early and the user was credited."
          : "Already credited — nothing further was paid.",
      });
    }

    const pointsPerUsd = await getPointsPerUsd();
    // Legacy pure-wall callback (no catalog completion behind it): credit here.
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
          // The USD value of what the USER earned. This used to increment by
          // `payoutAmount` — the network's payout to the platform — mixing a
          // different quantity (and a different unit basis) into the same
          // column every other earn path writes as points ÷ pointsPerUsd.
          totalEarnings: { increment: callback.userPayout / pointsPerUsd },
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
