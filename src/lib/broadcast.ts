/**
 * Admin broadcasts — one notification or email, delivered to an audience of any
 * size without a request having to stay alive for it.
 *
 * What this replaces: the send endpoint used to load every recipient id into
 * memory, write them all in one `createMany`, and then send emails forty at a
 * time inside the same HTTP request. Past a few thousand users that request
 * cannot finish inside a function's time limit, and when it died there was no
 * record of who had already been written to — so a retry either double-notified
 * everyone or the admin simply stopped pressing the button. Scheduling was
 * worse than incomplete: it wrote an audit row saying "scheduled" and nothing,
 * anywhere, ever sent it.
 *
 * The shape now:
 *
 *   1. `createBroadcast` writes ONE row and returns. Nothing is delivered yet.
 *   2. `deliverBroadcast` moves it forward by a bounded amount of work — some
 *      recipients enumerated, some notifications written, some emails sent —
 *      and returns. It is safe to call from anywhere, at any time, twice at
 *      once.
 *   3. The scheduler calls it every minute until the broadcast is finished; the
 *      send endpoint also calls it once inline, so a message to five people is
 *      already delivered by the time the admin's screen refreshes.
 *
 * Every "have I done this yet?" lives in `BroadcastRecipient`, not in a running
 * function, which is what makes step 2 resumable and repeat-safe.
 *
 * ── On limits ────────────────────────────────────────────────────────────────
 * In-app notifications and push are ours and cost nothing, so they are not
 * capped — they drain as fast as the ticks allow.
 *
 * Email is not ours. Every SMTP provider enforces a daily ceiling and a rate,
 * and exceeding either does not bounce one message, it gets the sending domain
 * throttled or suspended — which takes password resets and email verification
 * down with it. So email is paced by two admin settings, and the ceiling is a
 * real number the owner can raise to match their provider rather than a limit
 * invented here. Setting either to 0 means unlimited.
 */
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { audienceWhereResolved, type AudienceCriteria } from "@/lib/audience";
import { sendNotificationEmail, isSmtpConfigured } from "@/lib/email";
import { getMailConfig } from "@/lib/mailer";
import { sendPushToUsers, isOneSignalConfigured } from "@/lib/onesignal";
import type { Prisma, NotificationType } from "@/generated/prisma/client";

export type BroadcastChannels = { inApp: boolean; push: boolean; email: boolean };
export type BroadcastTargetKind = "ALL" | "SEGMENT" | "PACKAGE" | "SPECIFIC";

/**
 * Defaults chosen against what providers actually allow, not against what is
 * convenient:
 *
 *   Gmail / Google Workspace SMTP   500 / day
 *   SendGrid free                   100 / day
 *   Amazon SES sandbox              200 / day, 1 per second
 *   Amazon SES production          50,000 / day typical, 14 per second
 *
 * 500/day is Gmail's ceiling and Gmail is the most likely thing behind an SMTP
 * box that was filled in by hand, so it is the safe default. An owner on SES or
 * a dedicated provider raises it once and never thinks about it again.
 */
const DEFAULT_DAILY_CAP = 500;
const DEFAULT_PER_MINUTE = 60;

/** How many rows one enumeration / delivery pass touches. */
const ENUMERATE_CHUNK = 2000;
const INAPP_CHUNK = 500;
const PUSH_CHUNK = 1000;

export async function emailDailyCap(): Promise<number> {
  const v = await getSetting<number>("email_daily_cap", DEFAULT_DAILY_CAP);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_CAP;
}

export async function emailPerMinute(): Promise<number> {
  const v = await getSetting<number>("email_per_minute", DEFAULT_PER_MINUTE);
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_PER_MINUTE;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Emails this platform has actually put on the wire today, across every
 * broadcast.
 *
 * Counted from the delivery rows rather than from a counter we increment,
 * because a counter drifts the first time a process dies between sending and
 * incrementing — and it drifts in the dangerous direction, undercounting, which
 * is how a daily cap silently stops capping.
 */
export async function emailsSentToday(): Promise<number> {
  return prisma.broadcastRecipient.count({
    where: { emailAt: { gte: startOfToday() } },
  });
}

export type EmailBudget = {
  cap: number;
  usedToday: number;
  /** How many more may go out today. `Infinity` when the cap is 0 (unlimited). */
  remainingToday: number;
  perMinute: number;
};

export async function emailBudget(): Promise<EmailBudget> {
  const [cap, perMinute, usedToday] = await Promise.all([
    emailDailyCap(),
    emailPerMinute(),
    emailsSentToday(),
  ]);
  return {
    cap,
    usedToday,
    remainingToday: cap === 0 ? Infinity : Math.max(0, cap - usedToday),
    perMinute,
  };
}

/* ------------------------------------------------------------------ *
 * Creating
 * ------------------------------------------------------------------ */

export type CreateBroadcastInput = {
  createdById: string;
  title: string;
  message: string;
  type?: NotificationType;
  emailSubject?: string | null;
  emailBody?: string | null;
  priority?: string;
  imageUrl?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  channels: BroadcastChannels;
  targetKind: BroadcastTargetKind;
  criteria?: AudienceCriteria | null;
  userIds?: string[];
  packages?: string[];
  scheduledFor?: Date | null;
};

export async function createBroadcast(input: CreateBroadcastInput) {
  const scheduled =
    input.scheduledFor && input.scheduledFor.getTime() > Date.now() + 30_000
      ? input.scheduledFor
      : null;

  return prisma.broadcast.create({
    data: {
      createdById: input.createdById,
      title: input.title,
      message: input.message,
      type: input.type ?? "SYSTEM",
      emailSubject: input.emailSubject ?? null,
      emailBody: input.emailBody ?? null,
      priority: input.priority ?? "NORMAL",
      imageUrl: input.imageUrl ?? null,
      actionUrl: input.actionUrl ?? null,
      actionLabel: input.actionLabel ?? null,
      channels: input.channels as unknown as Prisma.InputJsonValue,
      targetKind: input.targetKind,
      criteria: (input.criteria ?? undefined) as unknown as Prisma.InputJsonValue,
      userIds: input.userIds ?? [],
      packages: input.packages ?? [],
      // A scheduled broadcast enumerates nothing until its time comes: the
      // audience is whoever matches THEN, which is the only reading that makes
      // sense for "send this to everyone in Dhaka next Friday".
      status: scheduled ? "SCHEDULED" : "SENDING",
      scheduledFor: scheduled,
      startedAt: scheduled ? null : new Date(),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Audience
 * ------------------------------------------------------------------ */

/** The `User` filter a broadcast's target resolves to. */
export async function broadcastWhere(b: {
  targetKind: string;
  criteria: unknown;
  userIds: string[];
  packages: string[];
}): Promise<Prisma.UserWhereInput> {
  if (b.targetKind === "SPECIFIC") {
    return { id: { in: b.userIds } };
  }
  if (b.targetKind === "PACKAGE") {
    return { status: "ACTIVE", package: { slug: { in: b.packages } } };
  }
  if (b.targetKind === "SEGMENT" && b.criteria && typeof b.criteria === "object") {
    return audienceWhereResolved(b.criteria as AudienceCriteria);
  }
  return { status: "ACTIVE" };
}

/** How many users a target currently matches — the number the admin previews. */
export async function estimateAudience(b: {
  targetKind: string;
  criteria: unknown;
  userIds: string[];
  packages: string[];
}): Promise<number> {
  return prisma.user.count({ where: await broadcastWhere(b) });
}

/**
 * Write the next chunk of recipient rows.
 *
 * Paged by id rather than by `skip`, because the audience is a live query: a
 * user who signs up mid-enumeration shifts every later offset and the shift
 * silently drops somebody. Returns whether the audience is now complete.
 */
async function enumerateChunk(broadcastId: string): Promise<{ added: number; done: boolean }> {
  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { targetKind: true, criteria: true, userIds: true, packages: true },
  });
  if (!b) return { added: 0, done: true };

  const last = await prisma.broadcastRecipient.findFirst({
    where: { broadcastId },
    orderBy: { userId: "desc" },
    select: { userId: true },
  });

  const where = await broadcastWhere(b);
  const users = await prisma.user.findMany({
    where: last ? { AND: [where, { id: { gt: last.userId } }] } : where,
    orderBy: { id: "asc" },
    take: ENUMERATE_CHUNK,
    select: { id: true, email: true, emailNotifications: true },
  });

  if (users.length === 0) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { audienceReady: true },
    });
    return { added: 0, done: true };
  }

  // `skipDuplicates` is what makes a re-run harmless: a tick killed after the
  // insert but before the count update repeats this exact chunk.
  const res = await prisma.broadcastRecipient.createMany({
    data: users.map((u) => ({
      broadcastId,
      userId: u.id,
      // Opted-out and deleted accounts are recorded as recipients with no
      // address, so they count as "reached" for in-app and are simply never
      // emailed. Dropping them here instead would make the totals disagree
      // with the audience the admin was shown.
      email:
        u.emailNotifications && u.email && !u.email.endsWith("@deleted.local")
          ? u.email
          : null,
    })),
    skipDuplicates: true,
  });

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      totalRecipients: { increment: res.count },
      audienceReady: users.length < ENUMERATE_CHUNK,
    },
  });

  return { added: res.count, done: users.length < ENUMERATE_CHUNK };
}

/* ------------------------------------------------------------------ *
 * Delivering
 * ------------------------------------------------------------------ */

export type DeliveryPass = {
  broadcastId: string;
  enumerated: number;
  inApp: number;
  push: number;
  email: number;
  emailFailed: number;
  /** Set when the pass stopped for a reason the admin should see. */
  note?: string;
  finished: boolean;
};

/**
 * Move one broadcast forward by a bounded amount of work.
 *
 * `maxMs` is a soft budget checked between steps, so a caller with a 60-second
 * function ceiling can hand over 8 seconds and be sure of getting control back.
 * Nothing is lost by stopping early — the next call resumes from the rows.
 */
export async function deliverBroadcast(
  broadcastId: string,
  opts: { maxMs?: number; maxEmails?: number } = {}
): Promise<DeliveryPass> {
  const deadline = Date.now() + (opts.maxMs ?? 10_000);
  const out: DeliveryPass = {
    broadcastId,
    enumerated: 0,
    inApp: 0,
    push: 0,
    email: 0,
    emailFailed: 0,
    finished: false,
  };

  const b = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!b) return { ...out, finished: true, note: "Broadcast no longer exists" };
  if (b.status !== "SENDING") {
    return { ...out, finished: b.status === "DONE", note: `Status is ${b.status}` };
  }

  const channels = (b.channels ?? {}) as Partial<BroadcastChannels>;

  // 1. Enumerate. Delivery starts before the audience is fully known, so a
  //    million-user send is not silent for its first several minutes.
  while (!b.audienceReady && Date.now() < deadline) {
    const chunk = await enumerateChunk(broadcastId);
    out.enumerated += chunk.added;
    if (chunk.done) {
      b.audienceReady = true;
      break;
    }
  }

  // 2. In-app. Free and ours, so uncapped.
  if (channels.inApp !== false) {
    while (Date.now() < deadline) {
      const pending = await prisma.broadcastRecipient.findMany({
        where: { broadcastId, inAppAt: null },
        take: INAPP_CHUNK,
        select: { id: true, userId: true },
      });
      if (pending.length === 0) break;

      const data = {
        broadcastId,
        priority: b.priority,
        ...(b.imageUrl ? { imageUrl: b.imageUrl } : {}),
        ...(b.actionUrl ? { actionUrl: b.actionUrl } : {}),
        ...(b.actionLabel ? { actionLabel: b.actionLabel } : {}),
      };

      await prisma.notification.createMany({
        data: pending.map((r) => ({
          userId: r.userId,
          type: b.type,
          title: b.title,
          message: b.message,
          data: data as Prisma.InputJsonValue,
        })),
      });
      // Marked after the write, never before: a crash in between re-sends to
      // that chunk, which is a duplicate notification — annoying. The other
      // order loses the notification entirely, which is a lie in the report.
      const marked = await prisma.broadcastRecipient.updateMany({
        where: { id: { in: pending.map((r) => r.id) } },
        data: { inAppAt: new Date() },
      });
      out.inApp += marked.count;
    }
    if (out.inApp > 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { inAppSent: { increment: out.inApp } },
      });
    }
  }

  // 3. Push. One call per chunk of ids; the provider fans out.
  if (channels.push && b.pushSent === 0 && isOneSignalConfigured()) {
    const ids = await prisma.broadcastRecipient.findMany({
      where: { broadcastId },
      take: PUSH_CHUNK,
      select: { userId: true },
    });
    if (ids.length > 0) {
      const r = await sendPushToUsers(
        ids.map((x) => x.userId),
        b.title,
        b.message,
        { type: b.type, broadcastId },
        b.actionUrl ?? undefined
      );
      if (r?.success) {
        out.push = ids.length;
        await prisma.broadcast.update({
          where: { id: broadcastId },
          data: { pushSent: { increment: ids.length } },
        });
      }
    }
  }

  // 4. Email — the only capped channel, and the only one that can be refused
  //    by somebody else.
  if (channels.email) {
    const pass = await deliverEmails(b.id, {
      deadline,
      subject: b.emailSubject || b.title,
      body: b.emailBody || b.message,
      actionUrl: b.actionUrl,
      maxEmails: opts.maxEmails,
    });
    out.email = pass.sent;
    out.emailFailed = pass.failed;
    if (pass.note) out.note = pass.note;
  }

  // 5. Finished? Only when the audience is fully enumerated AND every enabled
  //    channel has nothing left to do.
  const fresh = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { audienceReady: true, status: true },
  });
  if (fresh?.audienceReady && fresh.status === "SENDING") {
    const [inAppLeft, emailLeft] = await Promise.all([
      channels.inApp !== false
        ? prisma.broadcastRecipient.count({ where: { broadcastId, inAppAt: null } })
        : Promise.resolve(0),
      channels.email
        ? prisma.broadcastRecipient.count({
            where: { broadcastId, emailAt: null, email: { not: null }, attempts: { lt: 3 } },
          })
        : Promise.resolve(0),
    ]);
    if (inAppLeft === 0 && emailLeft === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: "DONE", finishedAt: new Date() },
      });
      out.finished = true;
    }
  }

  return out;
}

/**
 * Send as many of one broadcast's emails as today's budget and this pass's
 * time allow.
 *
 * `attempts` is incremented before the send, not after. A message that makes
 * the transport hang or throw something unserialisable would otherwise be
 * retried forever, and a stuck broadcast blocks every one behind it.
 */
async function deliverEmails(
  broadcastId: string,
  opts: {
    deadline: number;
    subject: string;
    body: string;
    actionUrl?: string | null;
    maxEmails?: number;
  }
): Promise<{ sent: number; failed: number; note?: string }> {
  if (!(await isSmtpConfigured())) {
    return { sent: 0, failed: 0, note: "SMTP is not configured — no email was sent" };
  }
  // `sendMail` silently returns false for non-transactional mail while the
  // master "Email notifications" switch is off. Reporting that as delivery is
  // how a broadcast could claim four thousand sends with nothing on the wire.
  if (!(await getMailConfig()).enabled) {
    return {
      sent: 0,
      failed: 0,
      note: "Email notifications are switched off in Settings — nothing was sent",
    };
  }

  const budget = await emailBudget();
  if (budget.remainingToday <= 0) {
    return {
      sent: 0,
      failed: 0,
      note: `Daily email cap reached (${budget.usedToday}/${budget.cap}). The rest goes out tomorrow.`,
    };
  }

  const perPass = Math.min(
    opts.maxEmails ?? (budget.perMinute || Number.MAX_SAFE_INTEGER),
    budget.perMinute || Number.MAX_SAFE_INTEGER,
    budget.remainingToday
  );

  let sent = 0;
  let failed = 0;

  while (sent + failed < perPass && Date.now() < opts.deadline) {
    const slice = await prisma.broadcastRecipient.findMany({
      where: {
        broadcastId,
        emailAt: null,
        email: { not: null },
        // Three goes, then it is a reported failure rather than an infinite
        // retry against an address that does not exist.
        attempts: { lt: 3 },
      },
      take: Math.min(25, perPass - sent - failed),
      select: { id: true, email: true },
    });
    if (slice.length === 0) break;

    await prisma.broadcastRecipient.updateMany({
      where: { id: { in: slice.map((r) => r.id) } },
      data: { attempts: { increment: 1 } },
    });

    const results = await Promise.allSettled(
      slice.map((r) =>
        sendNotificationEmail(r.email as string, opts.subject, opts.body, opts.actionUrl ?? undefined)
      )
    );

    const okIds: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === "fulfilled") {
        okIds.push(slice[i].id);
      } else {
        failed++;
        await prisma.broadcastRecipient.update({
          where: { id: slice[i].id },
          data: {
            emailError: String(
              res.reason instanceof Error ? res.reason.message : res.reason
            ).slice(0, 300),
          },
        });
      }
    }
    if (okIds.length) {
      await prisma.broadcastRecipient.updateMany({
        where: { id: { in: okIds } },
        data: { emailAt: new Date(), emailError: null },
      });
      sent += okIds.length;
    }
  }

  if (sent || failed) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        emailSent: { increment: sent },
        emailFailed: { increment: failed },
      },
    });
  }

  const note =
    sent + failed >= perPass && budget.remainingToday <= perPass
      ? `Daily email cap reached (${budget.cap}). The rest goes out tomorrow.`
      : undefined;
  return { sent, failed, note };
}

/* ------------------------------------------------------------------ *
 * The sweep the scheduler runs
 * ------------------------------------------------------------------ */

export type BroadcastSweep = {
  promoted: number;
  passes: DeliveryPass[];
};

/**
 * Start anything whose scheduled time has arrived, then push every live
 * broadcast forward.
 *
 * Oldest first, so a large send cannot be starved by newer small ones — and
 * capped at a handful per tick so one sweep stays well inside its lease.
 */
export async function runBroadcastSweep(
  opts: { maxMs?: number } = {}
): Promise<BroadcastSweep> {
  const deadline = Date.now() + (opts.maxMs ?? 45_000);

  const due = await prisma.broadcast.updateMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    data: { status: "SENDING", startedAt: new Date() },
  });

  const live = await prisma.broadcast.findMany({
    where: { status: "SENDING" },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true },
  });

  const passes: DeliveryPass[] = [];
  for (const b of live) {
    if (Date.now() >= deadline) break;
    passes.push(
      await deliverBroadcast(b.id, { maxMs: Math.max(2_000, deadline - Date.now()) })
    );
  }

  return { promoted: due.count, passes };
}

export function summariseSweep(s: BroadcastSweep): string {
  if (s.promoted === 0 && s.passes.length === 0) return "Nothing to send.";
  const totals = s.passes.reduce(
    (a, p) => ({
      inApp: a.inApp + p.inApp,
      email: a.email + p.email,
      failed: a.failed + p.emailFailed,
      done: a.done + (p.finished ? 1 : 0),
    }),
    { inApp: 0, email: 0, failed: 0, done: 0 }
  );
  const bits: string[] = [];
  if (s.promoted) bits.push(`${s.promoted} started`);
  if (totals.inApp) bits.push(`${totals.inApp} notified`);
  if (totals.email) bits.push(`${totals.email} emailed`);
  if (totals.failed) bits.push(`${totals.failed} email failures`);
  if (totals.done) bits.push(`${totals.done} finished`);
  const note = s.passes.find((p) => p.note)?.note;
  return (bits.length ? bits.join(", ") + "." : "Nothing to send.") + (note ? ` ${note}` : "");
}
