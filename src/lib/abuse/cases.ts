import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { ROLE_PERMISSIONS, type UserRole } from "@/lib/rbac";
import type { AbuseSignal } from "./signal";
import { addEvidence } from "./evidence";
import { hideEntity, setAccountStatus } from "./actions";
import { ABUSE_DEFAULTS, ABUSE_SETTING_KEYS, openKeyFor, severitiesBelow, severityRank } from "./policy";

/**
 * Turn a signal into an Abuse Center case.
 *
 *  1. Fold it into the OPEN case for the same (kind, user, item) — by the
 *     unique `openKey`, so two signals arriving together still make one case —
 *     or open a new one. Severity only ever rises.
 *  2. Keep the signal itself as SIGNAL evidence (append-only).
 *  3. On a new or newly-escalated HIGH/CRITICAL case, tell the admins.
 *  4. CRITICAL: hide that one item (on by default), and suspend the account
 *     only if the owner turned that on (off by default; never staff).
 *
 * Never throws — `raiseAbuseSignal` callers must not break on it.
 */
export async function recordAbuseSignal(signal: AbuseSignal): Promise<void> {
  await recordAbuseSignalForCase(signal);
}

/** Same as `recordAbuseSignal`, returning the case id (null if it failed). */
export async function recordAbuseSignalForCase(signal: AbuseSignal): Promise<string | null> {
  try {
    const userId = signal.userId ?? (await ownerOf(signal.entityType, signal.entityId));
    const s: AbuseSignal = { ...signal, userId: userId ?? null };
    const openKey = openKeyFor(s);
    const now = new Date();
    const summary = s.summary.slice(0, 1000);

    const existing = openKey
      ? await prisma.abuseCase.findUnique({ where: { openKey }, select: { id: true, severity: true } })
      : null;
    let caseId: string;
    let created = false;
    let escalated = false;
    if (existing) {
      caseId = existing.id;
      await prisma.abuseCase.update({
        where: { id: caseId },
        data: { signalCount: { increment: 1 }, lastSeenAt: now },
      });
      const up = await prisma.abuseCase.updateMany({
        where: { id: caseId, severity: { in: severitiesBelow(s.severity) } },
        data: { severity: s.severity, summary },
      });
      escalated = up.count > 0;
    } else {
      try {
        const row = await prisma.abuseCase.create({
          data: {
            kind: s.kind,
            severity: s.severity,
            userId: s.userId ?? null,
            entityType: s.entityType ?? null,
            entityId: s.entityId ?? null,
            summary,
            openKey,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true },
        });
        caseId = row.id;
        created = true;
      } catch (e) {
        // Lost the race to an identical signal: fold into its case.
        if (!(openKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        const row = await prisma.abuseCase.update({
          where: { openKey: openKey as string },
          data: { signalCount: { increment: 1 }, lastSeenAt: now },
          select: { id: true },
        });
        caseId = row.id;
      }
    }

    await addEvidence(caseId, "SIGNAL", {
      kind: s.kind,
      severity: s.severity,
      summary,
      entityType: s.entityType ?? null,
      entityId: s.entityId ?? null,
      userId: s.userId ?? null,
      evidence: s.evidence ?? null,
    });

    const serious = severityRank(s.severity) >= severityRank("HIGH");
    if (serious && (created || escalated)) await notifyAdmins(caseId, s).catch(() => {});

    if (s.severity === "CRITICAL") await applyCriticalRules(caseId, s).catch((e) => console.error("[abuse] auto rule failed", e));
    return caseId;
  } catch (e) {
    console.error("[abuse] recordAbuseSignal failed", signal.kind, e);
    return null;
  }
}

/** The account behind an item, when the signal did not say. */
async function ownerOf(entityType?: string, entityId?: string | null): Promise<string | null> {
  if (!entityType || !entityId) return null;
  const t = entityType.toLowerCase();
  try {
    if (t === "post") return (await prisma.post.findUnique({ where: { id: entityId }, select: { userId: true } }))?.userId ?? null;
    if (t === "comment") return (await prisma.comment.findUnique({ where: { id: entityId }, select: { userId: true } }))?.userId ?? null;
    if (t === "listing") return (await prisma.marketplaceListing.findUnique({ where: { id: entityId }, select: { sellerId: true } }))?.sellerId ?? null;
    if (t === "user" || t === "profile") return (await prisma.user.findUnique({ where: { id: entityId }, select: { id: true } }))?.id ?? null;
    if (t === "task") {
      const task = await prisma.task.findUnique({ where: { id: entityId }, select: { createdById: true, fundedByUserId: true } });
      return task?.fundedByUserId ?? task?.createdById ?? null;
    }
    if (t === "ad") {
      const ad = await prisma.ad.findUnique({ where: { id: entityId }, select: { submittedById: true, campaign: { select: { advertiserId: true } } } });
      return ad?.submittedById ?? ad?.campaign.advertiserId ?? null;
    }
  } catch {
    /* unknown id — leave the case without an account */
  }
  return null;
}

async function applyCriticalRules(caseId: string, s: AbuseSignal): Promise<void> {
  const [autoHide, autoSuspend] = await Promise.all([
    getSetting<boolean>(ABUSE_SETTING_KEYS.autoHideOnCritical, ABUSE_DEFAULTS.autoHideOnCritical),
    getSetting<boolean>(ABUSE_SETTING_KEYS.autoSuspendOnCritical, ABUSE_DEFAULTS.autoSuspendOnCritical),
  ]);

  if (autoHide !== false && s.entityType && s.entityId) {
    const r = await hideEntity(s.entityType, s.entityId, null);
    if (r.changed > 0) {
      await addEvidence(caseId, "ACTION", {
        action: "hide_item",
        label: "Hid the item automatically (critical signal)",
        auto: true,
        ok: true,
        changed: r.changed,
        ids: r.ids,
      });
      await writeAudit({
        actorId: null,
        action: "ABUSE_AUTO_HIDE",
        entity: "AbuseCase",
        entityId: caseId,
        targetUserId: s.userId ?? null,
        summary: `Abuse Center hid a ${s.entityType} automatically — ${s.summary}`.slice(0, 500),
        meta: { caseId, entityType: s.entityType, entityId: s.entityId, kind: s.kind },
      });
    }
  }

  if (autoSuspend === true && s.userId) {
    const r = await setAccountStatus({
      userId: s.userId,
      to: "SUSPENDED",
      reason: `Automatic suspension: ${s.summary}`.slice(0, 1000),
      actorId: null,
    });
    await addEvidence(caseId, "ACTION", {
      action: "suspend_user",
      label: "Suspended automatically (critical signal)",
      auto: true,
      ok: r.ok,
      message: r.message,
      ids: r.ok ? { users: [s.userId] } : {},
    });
    if (r.ok) {
      await writeAudit({
        actorId: null,
        action: "ABUSE_AUTO_SUSPEND",
        entity: "AbuseCase",
        entityId: caseId,
        targetUserId: s.userId,
        summary: `Abuse Center suspended the account automatically — ${s.summary}`.slice(0, 500),
        meta: { caseId, kind: s.kind },
      });
    }
  }
}

/** Staff who can see the Abuse Center by default get a bell notification. */
async function notifyAdmins(caseId: string, s: AbuseSignal): Promise<void> {
  const on = await getSetting<boolean>(ABUSE_SETTING_KEYS.notifyAdmins, ABUSE_DEFAULTS.notifyAdmins);
  if (on === false) return;
  const roles = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter((r) => ROLE_PERMISSIONS[r].includes("fraud.view"));
  const staff = await prisma.user.findMany({
    where: { role: { in: roles }, status: "ACTIVE" },
    select: { id: true },
    take: 25,
  });
  if (staff.length === 0) return;
  await prisma.notification.createMany({
    data: staff.map((u) => ({
      userId: u.id,
      type: "SYSTEM" as const,
      title: `${s.severity === "CRITICAL" ? "Critical" : "High"} abuse signal`,
      message: s.summary.slice(0, 300),
      data: { link: `/admin/abuse?case=${caseId}`, caseId },
    })),
  });
}
