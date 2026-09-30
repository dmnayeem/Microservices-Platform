import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { adminSetStatus, autoPauseAd, AdReviewError } from "@/lib/ad-review";
import { canAdministerStaffAccount, type UserRole } from "@/lib/rbac";
import { addEvidence, snapshotUser } from "./evidence";
import { ABUSE_ACTIONS, type AbuseAction } from "./policy";

/**
 * One-click actions for an abuse case. Each one reuses the mechanism the rest
 * of the platform already uses, and each one:
 *   - records the exact ids it changed as ACTION evidence (append-only), and
 *   - writes an audit row naming the affected account.
 *
 * "Remove" is always HIDE / UNPUBLISH / PAUSE — never delete — so the evidence
 * survives. The "restore" counterparts undo only what THIS case changed (the ids
 * in its own ACTION evidence), never anything an admin did for another reason.
 *
 * No action moves money. Holding withdrawals is a flag the approve route reads.
 */

export interface ActionResult {
  ok: boolean;
  changed: number;
  message: string;
}

type CaseRow = { id: string; userId: string | null; entityType: string | null; entityId: string | null; status: string; summary: string };

/** Ids an earlier action of this case changed (for its restore counterpart). */
async function idsChangedBy(caseId: string, action: AbuseAction): Promise<Record<string, string[]>> {
  const rows = await prisma.abuseEvidence.findMany({
    where: { caseId, kind: "ACTION" },
    select: { data: true },
  });
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const d = r.data as { action?: string; ids?: Record<string, string[]> } | null;
    if (d?.action !== action || !d.ids) continue;
    for (const [k, v] of Object.entries(d.ids)) out[k] = [...(out[k] ?? []), ...(Array.isArray(v) ? v : [])];
  }
  return out;
}

/** Suspend or ban, the same way the ban route and fraud auto-suspend do. */
export async function setAccountStatus(opts: {
  userId: string;
  to: "SUSPENDED" | "BANNED";
  reason: string;
  actorId: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const target = await prisma.user.findUnique({ where: { id: opts.userId }, select: { role: true, status: true } });
  if (!target) return { ok: false, message: "User not found." };
  if (target.role === "SUPER_ADMIN") return { ok: false, message: "A super admin account cannot be suspended here." };
  if (opts.actorId) {
    const actor = await prisma.user.findUnique({ where: { id: opts.actorId }, select: { role: true } });
    const check = canAdministerStaffAccount(actor?.role as UserRole | undefined, target.role as UserRole);
    if (!check.ok) return { ok: false, message: check.reason ?? "You cannot act on this account." };
  } else if (target.role !== "USER") {
    // Automatic rules never touch staff.
    return { ok: false, message: "Staff accounts are never suspended automatically." };
  }
  if (target.status === opts.to) return { ok: true, message: `Already ${opts.to.toLowerCase()}.` };

  await prisma.user.update({
    where: { id: opts.userId },
    data: { status: opts.to, suspendedReason: opts.reason.slice(0, 1000), suspendedAt: new Date() },
  });
  // Existing sessions: `requireActiveUser()` re-reads status on every action, so
  // a live session can no longer earn, withdraw or post from the next request.
  await prisma.notification
    .create({
      data: {
        userId: opts.userId,
        type: "SYSTEM",
        title: opts.to === "BANNED" ? "Account banned" : "Account suspended",
        message:
          opts.to === "BANNED"
            ? "Your account has been banned for a breach of our rules. Contact support if you believe this is a mistake."
            : "Your account has been suspended while we review a report. You can appeal from /appeal.",
      },
    })
    .catch(() => {});
  return { ok: true, message: opts.to === "BANNED" ? "Account banned." : "Account suspended." };
}

/**
 * Hide ONE item — the auto rule for a CRITICAL signal, and "hide only the
 * reported item". Unknown entity types (an upload, a link) have nothing to hide
 * here: those are blocked at the source.
 */
export async function hideEntity(
  entityType: string | null,
  entityId: string | null,
  actorId: string | null
): Promise<{ changed: number; ids: Record<string, string[]> }> {
  if (!entityType || !entityId) return { changed: 0, ids: {} };
  const t = entityType.toLowerCase();
  if (t === "post") {
    const r = await prisma.post.updateMany({ where: { id: entityId, isHidden: false }, data: { isHidden: true } });
    return { changed: r.count, ids: r.count ? { posts: [entityId] } : {} };
  }
  if (t === "comment") {
    const r = await prisma.comment.updateMany({ where: { id: entityId, isHidden: false }, data: { isHidden: true } });
    return { changed: r.count, ids: r.count ? { comments: [entityId] } : {} };
  }
  if (t === "listing") {
    const r = await prisma.marketplaceListing.updateMany({
      where: { id: entityId, status: "ACTIVE" },
      data: { status: "PENDING_REVIEW" },
    });
    return { changed: r.count, ids: r.count ? { listings: [entityId] } : {} };
  }
  if (t === "task") {
    const r = await prisma.task.updateMany({ where: { id: entityId, status: "ACTIVE" }, data: { status: "PAUSED" } });
    return { changed: r.count, ids: r.count ? { tasks: [entityId] } : {} };
  }
  if (t === "ad") {
    const ad = await prisma.ad.findUnique({ where: { id: entityId }, select: { status: true } });
    if (ad?.status !== "ACTIVE") return { changed: 0, ids: {} };
    // Ad.status has one writer: src/lib/ad-review.ts.
    if (actorId) await adminSetStatus({ adId: entityId, actorId, status: "PAUSED" });
    else await autoPauseAd({ adId: entityId, reason: "Abuse Center: critical signal" });
    return { changed: 1, ids: { ads: [entityId] } };
  }
  return { changed: 0, ids: {} };
}

async function run(c: CaseRow, action: AbuseAction, actorId: string, reason: string): Promise<{ ok: boolean; changed: number; message: string; ids: Record<string, string[]>; extra?: Record<string, unknown> }> {
  const uid = c.userId;
  if (ABUSE_ACTIONS[action].needsUser && !uid) {
    return { ok: false, changed: 0, message: "This case has no account attached.", ids: {} };
  }
  const userId = uid as string;
  const why = reason || `Abuse case ${c.id}: ${c.summary}`.slice(0, 500);

  switch (action) {
    case "preserve_evidence": {
      const snap = await snapshotUser(userId);
      await addEvidence(c.id, "SNAPSHOT", snap as unknown as Record<string, unknown>, actorId);
      return { ok: true, changed: 1, message: "Snapshot saved to the case.", ids: {} };
    }
    case "suspend_user":
    case "ban_user": {
      const r = await setAccountStatus({ userId, to: action === "ban_user" ? "BANNED" : "SUSPENDED", reason: why, actorId });
      return { ok: r.ok, changed: r.ok ? 1 : 0, message: r.message, ids: r.ok ? { users: [userId] } : {} };
    }
    case "restore_user": {
      const r = await prisma.user.updateMany({
        where: { id: userId, status: { in: ["SUSPENDED", "BANNED"] } },
        data: { status: "ACTIVE" },
      });
      if (r.count) {
        await prisma.notification
          .create({ data: { userId, type: "SYSTEM", title: "Account restored", message: "Your account has been restored. You can now access all features." } })
          .catch(() => {});
      }
      return { ok: true, changed: r.count, message: r.count ? "Account restored to active." : "Account was not suspended or banned.", ids: {} };
    }
    case "hide_content": {
      const [posts, comments] = await Promise.all([
        prisma.post.findMany({ where: { userId, isHidden: false }, select: { id: true } }),
        prisma.comment.findMany({ where: { userId, isHidden: false }, select: { id: true } }),
      ]);
      const pIds = posts.map((p) => p.id);
      const cIds = comments.map((x) => x.id);
      if (pIds.length) await prisma.post.updateMany({ where: { id: { in: pIds } }, data: { isHidden: true } });
      if (cIds.length) await prisma.comment.updateMany({ where: { id: { in: cIds } }, data: { isHidden: true } });
      return { ok: true, changed: pIds.length + cIds.length, message: `Hid ${pIds.length} posts and ${cIds.length} comments.`, ids: { posts: pIds, comments: cIds } };
    }
    case "restore_content": {
      const prev = await idsChangedBy(c.id, "hide_content");
      const hi = await idsChangedBy(c.id, "hide_item");
      const pIds = [...(prev.posts ?? []), ...(hi.posts ?? [])];
      const cIds = [...(prev.comments ?? []), ...(hi.comments ?? [])];
      const [p, cm] = await Promise.all([
        pIds.length ? prisma.post.updateMany({ where: { id: { in: pIds }, isHidden: true }, data: { isHidden: false } }) : { count: 0 },
        cIds.length ? prisma.comment.updateMany({ where: { id: { in: cIds }, isHidden: true }, data: { isHidden: false } }) : { count: 0 },
      ]);
      return { ok: true, changed: p.count + cm.count, message: `Un-hid ${p.count} posts and ${cm.count} comments.`, ids: { posts: pIds, comments: cIds } };
    }
    case "unpublish_listings": {
      const rows = await prisma.marketplaceListing.findMany({ where: { sellerId: userId, status: "ACTIVE" }, select: { id: true } });
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await prisma.marketplaceListing.updateMany({ where: { id: { in: ids }, status: "ACTIVE" }, data: { status: "PENDING_REVIEW" } });
      }
      return { ok: true, changed: ids.length, message: `Moved ${ids.length} listings back to review (off the shop).`, ids: { listings: ids } };
    }
    case "restore_listings": {
      const prev = await idsChangedBy(c.id, "unpublish_listings");
      const hi = await idsChangedBy(c.id, "hide_item");
      const ids = [...(prev.listings ?? []), ...(hi.listings ?? [])];
      const r = ids.length
        ? await prisma.marketplaceListing.updateMany({ where: { id: { in: ids }, status: "PENDING_REVIEW" }, data: { status: "ACTIVE" } })
        : { count: 0 };
      return { ok: true, changed: r.count, message: `Re-published ${r.count} listings.`, ids: { listings: ids } };
    }
    case "pause_ads": {
      const ads = await prisma.ad.findMany({
        where: { status: "ACTIVE", OR: [{ submittedById: userId }, { campaign: { advertiserId: userId } }] },
        select: { id: true },
      });
      const done: string[] = [];
      for (const a of ads) {
        try {
          await adminSetStatus({ adId: a.id, actorId, status: "PAUSED" });
          done.push(a.id);
        } catch (e) {
          if (!(e instanceof AdReviewError)) throw e;
        }
      }
      return { ok: true, changed: done.length, message: `Paused ${done.length} ads.`, ids: { ads: done } };
    }
    case "resume_ads": {
      const prev = await idsChangedBy(c.id, "pause_ads");
      const hi = await idsChangedBy(c.id, "hide_item");
      const ids = [...(prev.ads ?? []), ...(hi.ads ?? [])];
      const still = ids.length ? await prisma.ad.findMany({ where: { id: { in: ids }, status: "PAUSED" }, select: { id: true } }) : [];
      const done: string[] = [];
      for (const a of still) {
        try {
          await adminSetStatus({ adId: a.id, actorId, status: "ACTIVE" });
          done.push(a.id);
        } catch (e) {
          if (!(e instanceof AdReviewError)) throw e;
        }
      }
      return { ok: true, changed: done.length, message: `Resumed ${done.length} ads.`, ids: { ads: done } };
    }
    case "pause_tasks": {
      const rows = await prisma.task.findMany({
        where: { status: "ACTIVE", OR: [{ createdById: userId }, { fundedByUserId: userId }] },
        select: { id: true },
      });
      const ids = rows.map((r) => r.id);
      if (ids.length) await prisma.task.updateMany({ where: { id: { in: ids }, status: "ACTIVE" }, data: { status: "PAUSED" } });
      return { ok: true, changed: ids.length, message: `Paused ${ids.length} tasks.`, ids: { tasks: ids } };
    }
    case "resume_tasks": {
      const prev = await idsChangedBy(c.id, "pause_tasks");
      const hi = await idsChangedBy(c.id, "hide_item");
      const ids = [...(prev.tasks ?? []), ...(hi.tasks ?? [])];
      const r = ids.length
        ? await prisma.task.updateMany({ where: { id: { in: ids }, status: "PAUSED" }, data: { status: "ACTIVE" } })
        : { count: 0 };
      return { ok: true, changed: r.count, message: `Resumed ${r.count} tasks.`, ids: { tasks: ids } };
    }
    case "hold_withdrawals": {
      await prisma.abuseCase.update({ where: { id: c.id }, data: { withdrawalsHeld: true } });
      const open = await prisma.withdrawal.findMany({
        where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
        select: { id: true, status: true, netAmount: true, method: true },
      });
      const processing = open.filter((w) => w.status === "PROCESSING");
      return {
        ok: true,
        changed: open.length,
        message:
          `Hold on: ${open.length - processing.length} pending withdrawal(s) cannot be approved while this case is open.` +
          (processing.length ? ` ${processing.length} already approved (PROCESSING) — payment may be in flight; check those by hand.` : ""),
        ids: { withdrawals: open.map((w) => w.id) },
        extra: { withdrawals: open.map((w) => ({ id: w.id, status: w.status, netAmount: String(w.netAmount), method: w.method })) },
      };
    }
    case "release_withdrawals": {
      await prisma.abuseCase.update({ where: { id: c.id }, data: { withdrawalsHeld: false } });
      return { ok: true, changed: 1, message: "Withdrawal hold released (nothing was approved automatically).", ids: {} };
    }
    case "hide_item": {
      const r = await hideEntity(c.entityType, c.entityId, actorId);
      return { ok: true, changed: r.changed, message: r.changed ? "Item hidden." : "Nothing to hide (already hidden, or not a hideable item).", ids: r.ids };
    }
  }
}

/** Run one action on a case, record it, audit it. */
export async function runAbuseAction(opts: {
  caseId: string;
  action: AbuseAction;
  actorId: string;
  reason?: string;
}): Promise<ActionResult> {
  const c = await prisma.abuseCase.findUnique({
    where: { id: opts.caseId },
    select: { id: true, userId: true, entityType: true, entityId: true, status: true, summary: true },
  });
  if (!c) return { ok: false, changed: 0, message: "Case not found." };

  const r = await run(c, opts.action, opts.actorId, (opts.reason ?? "").trim());
  const label = ABUSE_ACTIONS[opts.action].label;

  await addEvidence(
    c.id,
    "ACTION",
    { action: opts.action, label, ok: r.ok, changed: r.changed, message: r.message, ids: r.ids, reason: opts.reason ?? null, ...(r.extra ?? {}) },
    opts.actorId
  );
  await writeAudit({
    actorId: opts.actorId,
    action: `ABUSE_${opts.action.toUpperCase()}`,
    entity: "AbuseCase",
    entityId: c.id,
    targetUserId: c.userId,
    summary: `Abuse Center: ${label} — ${r.message}`,
    meta: { caseId: c.id, action: opts.action, changed: r.changed, ok: r.ok, reason: opts.reason ?? null },
  });

  // Taking any real action moves an OPEN case on; its dedup key is released so
  // a later repeat of the same trouble opens a fresh case.
  if (r.ok && c.status === "OPEN" && opts.action !== "preserve_evidence") {
    await prisma.abuseCase.updateMany({ where: { id: c.id, status: "OPEN" }, data: { status: "ACTIONED", openKey: null } });
  }
  return { ok: r.ok, changed: r.changed, message: r.message };
}
