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
