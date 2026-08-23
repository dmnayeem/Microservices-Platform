import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can, canAny } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma/client";
import {
  REPORT_RESOLUTIONS,
  allowedResolutions,
  RESOLUTION_LABEL,
  REASON_LABEL,
} from "@/lib/moderation";
import { resolveContentOwner } from "@/lib/report-previews";
import {
  deletePostCascade,
  deleteCommentCascade,
  deleteListing,
  setPostHidden,
  setCommentHidden,
  setListingHidden,
  type DeleteOutcome,
} from "@/lib/content-delete";

const schema = z.object({
  resolution: z.enum(REPORT_RESOLUTIONS),
  resolverNote: z.string().max(2000).optional(),
  /**
   * Resolve every other pending report on the same content in one go. Ten
   * reports about one post used to be ten separate cards, and actioning one
   * left the other nine sitting in the queue.
   */
  applyToAll: z.boolean().optional(),
});

/**
 * Resolve a content report.
 *
 * What this replaced: a handler where `WARNED` did nothing at all, `LISTING`
 * reports did nothing (and LISTING is the only report type actually wired into
 * the user-facing UI), `HIDDEN` was rejected by the enum despite already
 * existing in the data, and the delete was a bare
 * `prisma.post.delete(...).catch(() => {})` — so a failure was swallowed while
 * the report was already marked RESOLVED/DELETED and audit-logged. A moderator
 * had no way to tell a successful removal from a failed one.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAny(session.user.id, ["social.moderate", "moderation.manage"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { resolution, resolverNote, applyToAll } = v.data;

  const report = await prisma.socialReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.status === "RESOLVED") {
    return NextResponse.json(
      { error: "This report has already been resolved." },
      { status: 409 }
    );
  }

  // The UI only offers what applies, but the API must not trust that.
  if (!allowedResolutions(report.contentType).includes(resolution)) {
    return NextResponse.json(
      {
        error: `"${RESOLUTION_LABEL[resolution]}" can't be applied to a ${report.contentType.toLowerCase()} report.`,
      },
      { status: 400 }
    );
  }

  const ownerId = await resolveContentOwner(report.contentType, report.contentId);

  // ── Do the thing FIRST, and only record success if it worked ─────────────
  let outcome: DeleteOutcome = { ok: true, extra: 0 };

  if (resolution === "DELETED") {
    outcome =
      report.contentType === "POST"
        ? await deletePostCascade(report.contentId)
        : report.contentType === "COMMENT"
          ? await deleteCommentCascade(report.contentId)
          : report.contentType === "LISTING"
            ? await deleteListing(report.contentId)
            : { ok: false, extra: 0, reason: "failed" };
  } else if (resolution === "HIDDEN") {
    outcome =
      report.contentType === "POST"
        ? await setPostHidden(report.contentId, true)
        : report.contentType === "COMMENT"
          ? await setCommentHidden(report.contentId, true)
          : report.contentType === "LISTING"
            ? await setListingHidden(report.contentId, true)
            : { ok: false, extra: 0, reason: "failed" };
  } else if (resolution === "BANNED" || resolution === "SUSPENDED") {
    // Applies to the AUTHOR, resolved from the content — the report itself
    // records no author, which is why these only ever worked on USER reports.
    if (!ownerId) {
      return NextResponse.json(
        { error: "Couldn't find the account behind this report — it may already be gone." },
        { status: 409 }
      );
    }
    if (!(await can(session.user.id, "users.ban"))) {
      return NextResponse.json(
        { error: "You don't have permission to suspend or ban accounts." },
        { status: 403 }
      );
    }
    const res = await prisma.user.updateMany({
      where: { id: ownerId },
      data: { status: resolution === "BANNED" ? "BANNED" : "SUSPENDED" },
    });
    outcome = res.count > 0 ? { ok: true, extra: 0 } : { ok: false, extra: 0, reason: "not_found" };
  }

  if (!outcome.ok) {
    // The report stays PENDING. Reporting success for an action that failed is
    // exactly what made the old "Removed (all-time)" figure meaningless.
    return NextResponse.json(
      {
        error:
          outcome.reason === "not_found"
            ? "That content no longer exists. Dismiss the report instead."
            : "The action failed, so the report was left open. Nothing was changed.",
      },
      { status: outcome.reason === "not_found" ? 409 : 500 }
    );
  }

  // ── Record it ────────────────────────────────────────────────────────────
  const now = new Date();
  const resolvedIds = [id];

  await prisma.$transaction(async (tx) => {
    await tx.socialReport.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolution,
        resolverNote: resolverNote ?? null,
        resolvedById: session.user.id,
        resolvedAt: now,
      },
    });

    if (applyToAll) {
      const siblings = await tx.socialReport.findMany({
        where: {
          status: "PENDING",
          contentType: report.contentType,
          contentId: report.contentId,
          NOT: { id },
        },
        select: { id: true },
      });
      if (siblings.length > 0) {
        await tx.socialReport.updateMany({
          where: { id: { in: siblings.map((s) => s.id) } },
          data: {
            status: "RESOLVED",
            resolution,
            resolverNote: resolverNote ?? "Resolved with another report on the same content.",
            resolvedById: session.user.id,
            resolvedAt: now,
          },
        });
        resolvedIds.push(...siblings.map((s) => s.id));
      }
    }
  });

  // ── Tell the author ──────────────────────────────────────────────────────
  // `WARNED` previously wrote nothing anywhere — the user was never told. Note
  // there is no warning-count column, so repeat warnings can't be tallied
  // without a migration; each one is simply delivered.
  if (ownerId && resolution !== "DISMISSED") {
    const reason = REASON_LABEL[report.reason] ?? report.reason;
    const message =
      resolution === "WARNED"
        ? `A moderator reviewed a report about your content (${reason}). Please review the community rules — repeated issues can lead to your account being suspended.`
        : resolution === "HIDDEN"
          ? `Your content was hidden after a report (${reason}).`
          : resolution === "DELETED"
            ? `Your content was removed after a report (${reason}).`
            : resolution === "SUSPENDED"
              ? `Your account has been suspended following a report (${reason}).`
              : `Your account has been banned following a report (${reason}).`;

    await notifyUser({
      userId: ownerId,
      type: NotificationType.SYSTEM,
      title: "Moderation action",
      message: resolverNote ? `${message}\n\nModerator note: ${resolverNote}` : message,
    }).catch(() => {
      // Delivery is best-effort — the moderation action itself already stands.
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: `MODERATION_${resolution}`,
      entity: "SocialReport",
      entityId: id,
      newData: {
        contentType: report.contentType,
        contentId: report.contentId,
        ownerId,
        resolverNote: resolverNote ?? null,
        alsoResolved: resolvedIds.length - 1,
        extraRowsRemoved: outcome.extra,
      },
    },
  });

  return NextResponse.json({
    success: true,
    resolved: resolvedIds.length,
    // e.g. "and 4 replies" — the count the old code silently got wrong.
    extraRemoved: outcome.extra,
  });
}

/**
 * PUT — reverse a hide.
 *
 * There was no un-hide anywhere in the codebase: the agency console could set
 * `isHidden`, and nothing could ever unset it. A reversible action nobody can
 * reverse is not reversible.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAny(session.user.id, ["social.moderate", "moderation.manage"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const report = await prisma.socialReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (report.resolution !== "HIDDEN") {
    return NextResponse.json(
      { error: "Only hidden content can be restored." },
      { status: 400 }
    );
  }

  const outcome =
    report.contentType === "POST"
      ? await setPostHidden(report.contentId, false)
      : report.contentType === "COMMENT"
        ? await setCommentHidden(report.contentId, false)
        : report.contentType === "LISTING"
          ? await setListingHidden(report.contentId, false)
          : { ok: false, extra: 0, reason: "failed" as const };

  if (!outcome.ok) {
    return NextResponse.json(
      { error: "That content no longer exists, so it can't be restored." },
      { status: 409 }
    );
  }

  await prisma.socialReport.update({
    where: { id },
    data: {
      resolution: "DISMISSED",
      resolverNote: "Content restored by a moderator.",
      resolvedById: session.user.id,
      resolvedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "MODERATION_RESTORED",
      entity: "SocialReport",
      entityId: id,
      newData: { contentType: report.contentType, contentId: report.contentId },
    },
  });

  return NextResponse.json({ success: true });
}
