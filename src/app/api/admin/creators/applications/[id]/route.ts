import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { sendApplicationDecision } from "@/lib/application-decision";
import { PROGRAMS } from "@/lib/application-requirements";
import { prisma } from "@/lib/prisma";
import {
  approveCreatorApplication,
  rejectCreatorApplication,
  grantBlueBadge,
  CREATOR_TYPES,
} from "@/lib/creator-application";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().max(2000).optional(),
  // BLUE_BADGE approvals only: how long the badge lasts.
  badgeLifetime: z.boolean().optional(),
  badgeDurationDays: z.number().int().min(1).max(3650).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "creators.review"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { action, adminNote, badgeLifetime, badgeDurationDays } = parsed.data;

  // Approving a blue-badge application gives the badge away, which the user
  // editor guards with its own permission — the same rule applies here.
  const target = await prisma.creatorApplication.findUnique({ where: { id }, select: { type: true } });
  if (!target) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const isBadge = target.type === "BLUE_BADGE";
  if (isBadge && action === "approve") {
    if (!(await can(session.user.id, "users.grant_badge"))) {
      return NextResponse.json(
        { error: 'Approving the blue badge needs the "users.grant_badge" permission — ask a super admin.' },
        { status: 403 }
      );
    }
    if (badgeLifetime !== true && badgeDurationDays === undefined) {
      return NextResponse.json({ error: "Choose how long the badge lasts (days) or tick Lifetime." }, { status: 400 });
    }
  }

  try {
    const app =
      action === "approve"
        ? await approveCreatorApplication({
            applicationId: id,
            reviewerId: session.user.id,
            adminNote: adminNote ?? null,
          })
        : await rejectCreatorApplication({
            applicationId: id,
            reviewerId: session.user.id,
            adminNote: adminNote ?? null,
          });

    if (isBadge && action === "approve") {
      const grant = await grantBlueBadge(app.userId, {
        lifetime: badgeLifetime === true,
        days: badgeLifetime === true ? null : badgeDurationDays!,
      });
      await writeAudit({
        actorId: session.user.id,
        action: "USER_BADGE_GRANTED",
        entity: "User",
        entityId: app.userId,
        targetUserId: app.userId,
        summary: grant.summary,
        meta: { ...grant.meta, applicationId: id, reason: adminNote || null },
      });
    }

    await writeAudit({
      actorId: session.user.id,
      action: action === "approve" ? "CREATOR_APP_APPROVE" : "CREATOR_APP_REJECT",
      entity: "CreatorApplication",
      entityId: id,
      targetUserId: app.userId,
      summary: `${action === "approve" ? "Approved" : "Rejected"} ${app.type} application${adminNote ? ` — ${adminNote}` : ""}`,
      meta: { type: app.type, adminNote: adminNote ?? null },
    });

    const meta = CREATOR_TYPES[app.type];
    sendApplicationDecision({
      userId: app.userId,
      program: PROGRAMS[app.type].label,
      approved: action === "approve",
      adminNote: adminNote ?? null,
      link: action === "approve" ? meta.dashboardHref : `/apply?type=${app.type}`,
    });

    return NextResponse.json({ success: true, application: { id: app.id, status: app.status } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
