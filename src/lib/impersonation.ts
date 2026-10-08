import { prisma } from "@/lib/prisma";
import { getSetting, saveSetting } from "@/lib/system-settings";
import { isStaffRole } from "@/lib/staff";

/**
 * "Login as user" — who may do it, and to whom. The ONE place this is decided:
 * the start route, the login step and every button read it.
 *
 *  - The super admin may always, and is the only one who decides who else may
 *    (Control Center → "Login as user"). A role permission is deliberately not
 *    enough: signing in as somebody is the most powerful thing in the panel, so
 *    it is granted to named admins, one by one.
 *  - Nobody can sign in as a super admin, or as themselves.
 *  - An admin who is not the super admin can only sign in as ordinary users —
 *    never as another staff account (that would be a way to borrow its rights).
 *  - The super admin can protect any account ("Block login as user"); a
 *    protected account can't be signed into by anyone, the super admin
 *    included, until the switch is turned off again.
 */

export const IMPERSONATE_ADMINS_KEY = "impersonate.allowed_admin_ids";

export async function getImpersonationAdmins(): Promise<string[]> {
  const v = await getSetting<unknown>(IMPERSONATE_ADMINS_KEY, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function setImpersonationAdmins(ids: string[]): Promise<void> {
  await saveSetting(IMPERSONATE_ADMINS_KEY, [...new Set(ids)].slice(0, 500), "security");
}

export interface ImpersonationActor {
  id: string;
  role: string;
  isSuper: boolean;
}

/** The signed-in admin, if they may use "Login as user" at all. Role is read from the DB, never the token. */
export async function impersonationActor(userId: string): Promise<ImpersonationActor | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
  if (!me || me.status !== "ACTIVE") return null;
  if (me.role === "SUPER_ADMIN") return { id: me.id, role: me.role, isSuper: true };
  if (!isStaffRole(me.role)) return null;
  const allowed = await getImpersonationAdmins();
  return allowed.includes(me.id) ? { id: me.id, role: me.role, isSuper: false } : null;
}

/** Why this actor may NOT sign in as this account — or null when they may. */
export function impersonationRefusal(
  actor: Pick<ImpersonationActor, "id" | "isSuper">,
  target: { id: string; role: string; impersonationBlocked: boolean }
): string | null {
  if (target.id === actor.id) return "You can't log in as yourself.";
  if (target.role === "SUPER_ADMIN") return "Nobody can log in as a super admin.";
  if (target.impersonationBlocked) return "The super admin has blocked logging in as this account.";
  if (!actor.isSuper && isStaffRole(target.role)) return "Only the super admin can log in as a staff account.";
  return null;
}
