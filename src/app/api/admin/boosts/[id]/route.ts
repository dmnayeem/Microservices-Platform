import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma";
import { approveBoost, cancelBoost, rejectBoost, setBoostPaused } from "@/lib/boost/core";

/**
 * POST /api/admin/boosts/:id { action, reason? } — the admin side of a member's
 * post boost. Every money move (refunds on reject / cancel) happens inside
 * src/lib/boost/core.ts; this route only gates, notifies and audits.
 */
type Action = "approve" | "reject" | "pause" | "resume" | "cancel";
const ACTIONS = new Set<Action>(["approve", "reject", "pause", "resume", "cancel"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const adminId = session?.user?.id;
  if (!adminId || !(await can(adminId, "social.promote"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };
  const action = body.action as Action;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const before = await prisma.boostCampaign.findUnique({
    where: { id },
    select: { userId: true, postId: true, status: true, budgetPoints: true, durationDays: true },
  });
  if (!before) return NextResponse.json({ error: "Boost not found" }, { status: 404 });

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (action === "reject" && reason.length < 3) {
    return NextResponse.json({ error: "Write the reason the member will see." }, { status: 400 });
  }

  let ok = false;
  if (action === "approve") ok = await approveBoost(id, adminId);
  else if (action === "reject") ok = await rejectBoost(id, adminId, reason);
  else if (action === "pause") ok = await setBoostPaused(id, true);
  else if (action === "resume") ok = await setBoostPaused(id, false);
  else ok = await cancelBoost(id, null);

  if (!ok) {
    // Someone else (another admin, the owner, the sweep) moved it first.
    return NextResponse.json(
      { error: "This boost has already changed — reload to see its current state." },
      { status: 409 }
    );
  }

  const after = await prisma.boostCampaign.findUnique({
    where: { id },
    select: { status: true, refundedPoints: true, spentPoints: true },
  });
  const refunded = after?.refundedPoints ?? 0;
  const link = before.postId ? `/post/${before.postId}` : "/boosts";

  // The owner hears about every decision that changes their boost or money.
  if (action === "approve") {
    await notifyUser({
      userId: before.userId,
      type: NotificationType.PROMOTION,
      title: "Your boost is live",
      message: `Your post boost was approved and runs for ${before.durationDays} day${before.durationDays === 1 ? "" : "s"}.`,
      link: "/boosts",
      data: { boostId: id },
    }).catch(() => {});
  } else if (action === "reject") {
    await notifyUser({
      userId: before.userId,
      type: NotificationType.PROMOTION,
      title: "Your boost was not approved",
      message: `Reason: ${reason}${refunded > 0 ? ` · ${refunded.toLocaleString()} Ad Points were returned.` : ""}`,
      link: "/boosts",
      data: { boostId: id, reason },
    }).catch(() => {});
  } else if (action === "cancel") {
    await notifyUser({
      userId: before.userId,
      type: NotificationType.PROMOTION,
      title: "Your boost was stopped",
      message: `An admin stopped your post boost.${refunded > 0 ? ` ${refunded.toLocaleString()} unspent Ad Points were returned.` : ""}`,
      link: "/boosts",
      data: { boostId: id },
    }).catch(() => {});
  }

  const verb = { approve: "Approved", reject: "Rejected", pause: "Paused", resume: "Resumed", cancel: "Cancelled" }[action];
  await writeAudit({
    actorId: adminId,
    action: `BOOST_${action.toUpperCase()}`,
    entity: "BoostCampaign",
    entityId: id,
    targetUserId: before.userId,
    summary: `${verb} a post boost (budget ${before.budgetPoints.toLocaleString()} Ad Points${
      refunded > 0 && (action === "reject" || action === "cancel") ? `, ${refunded.toLocaleString()} returned` : ""
    })${action === "reject" ? ` — ${reason}` : ""}`,
    meta: { from: before.status, to: after?.status, postId: before.postId, reason: reason || undefined, refunded, link },
  });

  return NextResponse.json({ ok: true, status: after?.status, refunded });
}
