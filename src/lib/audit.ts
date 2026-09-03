import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Central audit-log writer. Records an admin/user action into `AuditLog` for the
 * Admin Activity (super-admin) and User Activity (all admins) views.
 *
 * Fields:
 *  - actorId       who performed the action (the acting admin)
 *  - action        stable action code, e.g. "BALANCE_ADD_POINTS", "DEPOSIT_APPROVED"
 *  - entity        the record type acted on, e.g. "User", "Deposit", "Ad"
 *  - entityId      the acted-on record id
 *  - targetUserId  the user AFFECTED (so both feeds can pivot on "who it happened to")
 *  - summary       short human line for the feed, e.g. "Gave 500 pts + 2000 XP"
 *  - meta          structured detail (stored in newData)
 *
 * Fail-safe: never throws — an audit failure must never break the action itself.
 * IP + user-agent are captured from the request headers when available.
 */
export interface WriteAuditOpts {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  targetUserId?: string | null;
  summary?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function writeAudit(opts: WriteAuditOpts): Promise<void> {
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ipAddress =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        null;
      userAgent = h.get("user-agent");
    } catch {
      /* headers() unavailable outside a request — fine */
    }

    await prisma.auditLog.create({
      data: {
        userId: opts.actorId ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        targetUserId: opts.targetUserId ?? null,
        summary: opts.summary ?? null,
        newData:
          opts.meta != null
            ? (JSON.parse(JSON.stringify(opts.meta)) as Prisma.InputJsonValue)
            : undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (e) {
    console.error("writeAudit failed:", e);
  }
}

/**
 * Same record, once per affected user, in a single round trip.
 *
 * Bulk admin actions used to write ONE row naming no one — so a bulk ban or a
 * bulk points adjustment across 200 accounts left no trace on any of those
 * accounts, and the User Activity view (which pivots on `targetUserId`) showed
 * nothing at all. Per-user rows are what makes "what was done to this person"
 * answerable; `createMany` is what makes writing 200 of them affordable.
 *
 * Fail-safe, like `writeAudit`: an audit failure must not undo work already done.
 */
export async function writeAuditMany(
  rows: WriteAuditOpts[]
): Promise<void> {
  if (rows.length === 0) return;
  try {
    let ipAddress: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ipAddress =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        null;
      userAgent = h.get("user-agent");
    } catch {
      /* headers() unavailable outside a request — fine */
    }

    await prisma.auditLog.createMany({
      data: rows.map((opts) => ({
        userId: opts.actorId ?? null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId ?? null,
        targetUserId: opts.targetUserId ?? null,
        summary: opts.summary ?? null,
        newData:
          opts.meta != null
            ? (JSON.parse(JSON.stringify(opts.meta)) as Prisma.InputJsonValue)
            : undefined,
        ipAddress,
        userAgent,
      })),
    });
  } catch (e) {
    console.error("writeAuditMany failed:", e);
  }
}
