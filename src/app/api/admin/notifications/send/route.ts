import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  createBroadcast,
  deliverBroadcast,
  estimateAudience,
  emailBudget,
  type BroadcastTargetKind,
} from "@/lib/broadcast";
import type { AudienceCriteria } from "@/lib/audience";
import { isNotificationStyle } from "@/lib/notification-styles";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * Start one broadcast.
 *
 * This endpoint no longer delivers the whole send. It writes the broadcast
 * down, runs ONE bounded delivery pass so a message to a handful of people is
 * already gone by the time the screen refreshes, and leaves the rest to the
 * `broadcast-delivery` scheduler job.
 *
 * That is the difference between "send to everyone" working and not working.
 * The previous version loaded every recipient id into memory, wrote them in one
 * `createMany` and then sent emails inside the request; past a few thousand
 * users it could not finish, and a request that died left no record of who had
 * already been written to. Scheduling did not exist at all — it wrote an audit
 * row saying "scheduled" and nothing ever sent it.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface SendNotificationBody {
  type?: string;
  title: string;
  message: string;
  target: "all" | "package" | "specific" | "segment";
  packageFilter?: string[];
  userIds?: string[];

  // Legacy flat segment fields, still accepted.
  packages?: string[];
  minLevel?: number;
  maxLevel?: number;
  country?: string;
  activeWithinDays?: number;
  /** Full demographic / location segmentation (preferred). */
  criteria?: AudienceCriteria;

  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  /** Visual template — URGENT, OFFER, UPDATE … see lib/notification-styles.ts. */
  style?: string;
  kicker?: string;
  imageUrl?: string;
  actionUrl?: string;
  actionLabel?: string;
  scheduledFor?: string;

  /** Email may say more than a notification row can. Falls back to title/message. */
  emailSubject?: string;
  emailBody?: string;

  sendInApp?: boolean;
  sendPush?: boolean;
  sendEmail?: boolean;
  /** Service notice rather than marketing — reaches opted-out users, ignores the daily cap. */
  important?: boolean;

  url?: string;
}

const VALID_TYPES = [
  "SYSTEM",
  "TASK",
  "WALLET",
  "REFERRAL",
  "PROMOTION",
  "ACHIEVEMENT",
  "LOTTERY",
  "SOCIAL",
  "COURSE",
  "MESSAGE",
];

const TARGET_KIND: Record<string, BroadcastTargetKind> = {
  all: "ALL",
  package: "PACKAGE",
  specific: "SPECIFIC",
  segment: "SEGMENT",
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await can(session.user.id, "notifications.send"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: SendNotificationBody = await request.json();
    const {
      type = "SYSTEM",
      title,
      message,
      target,
      packageFilter,
      userIds,
      packages,
      minLevel,
      maxLevel,
      country,
      activeWithinDays,
      criteria,
      priority = "NORMAL",
      style = "PLAIN",
      kicker,
      imageUrl,
      actionUrl,
      actionLabel,
      scheduledFor,
      emailSubject,
      emailBody,
      sendInApp = true,
      sendPush = false,
      sendEmail = false,
      important = false,
      url,
    } = body;

    if (!title?.trim() || !message?.trim() || !target) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (title.length > 80) {
      return NextResponse.json({ error: "Title must be 80 characters or less" }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: "Message must be 500 characters or less" }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }
    if (!sendInApp && !sendPush && !sendEmail) {
      return NextResponse.json({ error: "Pick at least one channel" }, { status: 400 });
    }

    const targetKind = TARGET_KIND[target];
    if (!targetKind) {
      return NextResponse.json({ error: "Unknown target" }, { status: 400 });
    }
    if (targetKind === "SPECIFIC" && !userIds?.length) {
      return NextResponse.json({ error: "Pick at least one user" }, { status: 400 });
    }
    if (targetKind === "PACKAGE" && !packageFilter?.length) {
      return NextResponse.json({ error: "Pick at least one package" }, { status: 400 });
    }

    // The legacy flat fields are folded into AudienceCriteria here rather than
    // being carried through the pipeline, so there is one audience language.
    let resolvedCriteria: AudienceCriteria | null =
      criteria && Object.keys(criteria).length > 0 ? criteria : null;
    if (targetKind === "SEGMENT" && !resolvedCriteria) {
      resolvedCriteria = {
        ...(packages?.length ? { packages } : {}),
        ...(typeof minLevel === "number" && minLevel > 0 ? { minLevel } : {}),
        ...(typeof maxLevel === "number" && maxLevel > 0 ? { maxLevel } : {}),
        ...(country?.trim() ? { countries: [country.trim()] } : {}),
        ...(typeof activeWithinDays === "number" && activeWithinDays > 0
          ? { activeWithinDays }
          : {}),
      };
    }

    const target_ = {
      targetKind,
      criteria: resolvedCriteria,
      userIds: targetKind === "SPECIFIC" ? (userIds ?? []) : [],
      packages: targetKind === "PACKAGE" ? (packageFilter ?? []) : [],
    };

    // Refuse before writing anything if the audience is empty — an admin who
    // picks an impossible filter should be told, not handed a broadcast that
    // quietly finishes with zero recipients.
    const expected = await estimateAudience(target_);
    if (expected === 0) {
      return NextResponse.json(
        { error: "No recipients match that audience" },
        { status: 400 }
      );
    }

    const when = scheduledFor ? new Date(scheduledFor) : null;
    if (when && Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "That scheduled time is not a date" }, { status: 400 });
    }

    const broadcast = await createBroadcast({
      createdById: session.user.id,
      title: title.trim(),
      message: message.trim(),
      type: type as NotificationType,
      emailSubject: emailSubject?.trim() || null,
      emailBody: emailBody?.trim() || null,
      priority,
      // An unknown template renders as PLAIN rather than failing the send —
      // a notification with no decoration is a far better outcome than one
      // that never reaches anybody.
      style: isNotificationStyle(style) ? style : "PLAIN",
      kicker: kicker?.trim() || null,
      imageUrl: imageUrl || null,
      actionUrl: actionUrl || url || null,
      actionLabel: actionLabel || null,
      channels: { inApp: sendInApp !== false, push: !!sendPush, email: !!sendEmail },
      important: !!important,
      ...target_,
      criteria: resolvedCriteria,
      scheduledFor: when,
    });

    await writeAudit({
      actorId: session.user.id,
      action: broadcast.status === "SCHEDULED" ? "BROADCAST_SCHEDULED" : "BROADCAST_SENT",
      entity: "Broadcast",
      entityId: broadcast.id,
      ...(targetKind === "SPECIFIC" && userIds?.length === 1
        ? { targetUserId: userIds[0] }
        : {}),
      summary:
        broadcast.status === "SCHEDULED"
          ? `Scheduled "${title}" for ${when?.toLocaleString()} — about ${expected} recipient(s)`
          : `Sending ${important ? "an IMPORTANT notice " : ""}"${title}" to about ${expected} recipient(s) via ${[
              sendInApp !== false && "in-app",
              sendPush && "push",
              sendEmail && "email",
            ]
              .filter(Boolean)
              .join(" + ")}`,
      meta: { targetKind, expected, style, important: !!important, channels: { sendInApp, sendPush, sendEmail } },
    });

    if (broadcast.status === "SCHEDULED") {
      return NextResponse.json({
        success: true,
        broadcastId: broadcast.id,
        scheduled: true,
        scheduledFor: when?.toISOString(),
        recipientCount: expected,
        message: `Scheduled for ${when?.toLocaleString()} — about ${expected} recipient(s). It will be sent even if nobody is on the site.`,
      });
    }

    // One bounded pass inline. A send to a few dozen people finishes here; a
    // send to everyone gets its first slice out and the scheduler carries the
    // rest. Same function either way — there is no second delivery path that
    // could drift from this one.
    const pass = await deliverBroadcast(broadcast.id, { maxMs: 8_000 });

    // Keep pushing in the same invocation while the response is already on its
    // way to the browser. Free progress; the scheduler is still the guarantee.
    if (!pass.finished) {
      after(async () => {
        try {
          await deliverBroadcast(broadcast.id, { maxMs: 20_000 });
        } catch {
          /* the scheduler retries */
        }
      });
    }

    const budget = await emailBudget();

    return NextResponse.json({
      success: true,
      broadcastId: broadcast.id,
      recipientCount: expected,
      delivered: {
        inApp: pass.inApp,
        push: pass.push,
        email: pass.email,
        emailFailed: pass.emailFailed,
      },
      finished: pass.finished,
      note: pass.note,
      emailBudget: {
        cap: budget.cap,
        usedToday: budget.usedToday,
        remainingToday: budget.cap === 0 ? null : budget.remainingToday,
      },
      message: pass.finished
        ? `Sent to ${pass.inApp || expected} user(s).`
        : `Started — ${expected} recipient(s). Delivery continues in the background; watch it on Broadcasts.`,
    });
  } catch (error) {
    console.error("Error starting broadcast:", error);
    return NextResponse.json({ error: "Failed to start the broadcast" }, { status: 500 });
  }
}

/** Live counters for the Broadcasts screen and the send form's budget hint. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [budget, sending] = await Promise.all([
    emailBudget(),
    prisma.broadcast.count({ where: { status: { in: ["SENDING", "SCHEDULED"] } } }),
  ]);
  return NextResponse.json({
    emailBudget: {
      cap: budget.cap,
      usedToday: budget.usedToday,
      remainingToday: budget.cap === 0 ? null : budget.remainingToday,
      perMinute: budget.perMinute,
    },
    inFlight: sending,
  });
}
