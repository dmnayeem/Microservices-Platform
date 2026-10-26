import "server-only";
import { prisma } from "@/lib/prisma";

/** The caller's role read fresh from the database (not the session token). */
export async function freshRole(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return u?.role ?? null;
}

const MAX_SELECTED = 5000;

/**
 * The two private-task fields from a create/edit body — honoured for a
 * SUPER_ADMIN only. Anyone else's values are ignored (an edit keeps what the
 * task had), so an admin can neither make a task private nor un-private one.
 * Returns the fields to write, or an error for a bad user list.
 */
export async function privacyFieldsFromBody(
  role: string | null,
  body: { superAdminOnly?: unknown; allowedUserIds?: unknown }
): Promise<{ ok: true; data: { superAdminOnly?: boolean; allowedUserIds?: string[] } } | { ok: false; error: string }> {
  if (role !== "SUPER_ADMIN") return { ok: true, data: {} };
  const data: { superAdminOnly?: boolean; allowedUserIds?: string[] } = {};
  if (body.superAdminOnly !== undefined) data.superAdminOnly = body.superAdminOnly === true;
  if (body.allowedUserIds !== undefined) {
    if (!Array.isArray(body.allowedUserIds)) return { ok: false, error: "allowedUserIds must be a list" };
    const ids = [...new Set(body.allowedUserIds.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))];
    if (ids.length > MAX_SELECTED) return { ok: false, error: `At most ${MAX_SELECTED} selected members` };
    if (ids.length) {
      const found = await prisma.user.count({ where: { id: { in: ids }, status: { notIn: ["BANNED"] } } });
      if (found !== ids.length) return { ok: false, error: "One of the selected members doesn't exist (or is banned)." };
    }
    data.allowedUserIds = ids;
  }
  return { ok: true, data };
}
