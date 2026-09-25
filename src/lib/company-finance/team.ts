import "server-only";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/password-policy";
import {
  canAdministerStaffAccount,
  canAssignStaffRole,
  FINANCE_ADMIN_GRANTABLE,
  GRANTABLE_FINANCE_PERMISSIONS,
  type UserRole,
} from "@/lib/rbac";
import type { Result } from "./books";

/**
 * Who works on the books, and what each of them may do.
 *
 * The owner's rule, enforced here and in `stripProtectedForRole`:
 *   - Only a super admin and a finance admin see finance at all.
 *   - A super admin may grant any other staff member specific finance
 *     permissions, one by one.
 *   - A super admin OR a finance admin may create finance moderators; a finance
 *     admin may widen a moderator's desk, but only from a short list, and may
 *     touch no other account.
 *   - A manager may do none of this. Its job is administering staff, which is
 *     exactly why it must not be able to hand out access to money.
 */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export type Actor = { id: string; role: UserRole };

/** Everyone who can currently see or touch the books. */
export async function listFinanceTeam() {
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_MODERATOR"] } },
        { financeGrants: { isEmpty: false } },
      ],
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      financeGrants: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return rows;
}

/** Which permissions this actor may hand out, and to whom. */
export function grantableBy(actor: Actor, targetRole: UserRole): string[] {
  if (actor.role === "SUPER_ADMIN") {
    // A super admin never needs to grant a finance admin anything — the role
    // already holds it all — and granting ANOTHER super admin is meaningless.
    if (targetRole === "SUPER_ADMIN" || targetRole === "FINANCE_ADMIN") return [];
    return GRANTABLE_FINANCE_PERMISSIONS;
  }
  if (actor.role === "FINANCE_ADMIN" && targetRole === "FINANCE_MODERATOR") {
    return FINANCE_ADMIN_GRANTABLE;
  }
  return [];
}

/**
 * Replace one person's finance grants.
 *
 * The whole list is written, not a diff, so what the screen shows after saving
 * is exactly what is stored. Anything the actor is not allowed to grant is
 * refused by name rather than silently dropped — a grant that quietly did not
 * happen is how someone ends up believing a clerk can approve payments.
 */
export async function setFinanceGrants(
  actor: Actor,
  targetId: string,
  grants: string[]
): Promise<Result<{ grants: string[] }>> {
  if (actor.id === targetId) return fail("You cannot change your own finance access");

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, name: true, financeGrants: true },
  });
  if (!target) return fail("That account no longer exists");
  const targetRole = target.role as UserRole;

  // A finance admin may only act on its own moderators.
  if (actor.role !== "SUPER_ADMIN") {
    const check = canAdministerStaffAccount(actor.role, targetRole);
    if (!check.ok) return fail(check.reason);
  }

  const allowed = new Set(grantableBy(actor, targetRole));
  if (allowed.size === 0) {
    return fail(
      targetRole === "FINANCE_ADMIN" || targetRole === "SUPER_ADMIN"
        ? `${target.name ?? "This account"} already has full finance access through their role.`
        : "You cannot grant finance access to this account."
    );
  }

  const clean = [...new Set(grants.map((g) => String(g).trim()).filter(Boolean))];
  const refused = clean.filter((g) => !allowed.has(g));
  if (refused.length) return fail(`You cannot grant: ${refused.join(", ")}`);

  // A finance admin may widen a moderator but must not be able to take away
  // what a SUPER ADMIN granted them — that would let a finance admin quietly
  // undo the owner's decision. Super-admin-only grants are carried over.
  let next = clean;
  if (actor.role === "FINANCE_ADMIN") {
    const superOnly = target.financeGrants.filter((g) => !allowed.has(g));
    next = [...new Set([...clean, ...superOnly])];
  }

  await prisma.user.update({ where: { id: target.id }, data: { financeGrants: next } });
  return { ok: true, data: { grants: next } };
}

/** Create a brand-new finance moderator account. */
export async function createFinanceModerator(
  actor: Actor,
  input: { name: string; email: string; password: string; grants?: string[] }
): Promise<Result<{ id: string }>> {
  const assign = canAssignStaffRole(actor.role, "FINANCE_MODERATOR");
  if (!assign.ok) return fail(assign.reason);

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return fail("Give them a name");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email does not look right");
  const pwError = await validatePassword(input.password);
  if (pwError) return fail(pwError);

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return fail("An account with that email already exists — promote it instead");

  const allowed = new Set(grantableBy(actor, "FINANCE_MODERATOR"));
  const grants = [...new Set((input.grants ?? []).filter((g) => allowed.has(g)))];

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await bcrypt.hash(input.password, 12),
      role: "FINANCE_MODERATOR",
      status: "ACTIVE",
      emailVerified: new Date(),
      referralCode: uuidv4().slice(0, 8).toUpperCase(),
      financeGrants: grants,
    },
    select: { id: true },
  });
  return { ok: true, data: user };
}

/**
 * Make an existing account a finance moderator, or take the role away.
 *
 * Only a plain user is promoted. Turning a content admin into a finance
 * moderator would silently strip everything else they do — that decision
 * belongs to whoever administers that admin, not to finance.
 */
export async function setModeratorRole(
  actor: Actor,
  targetId: string,
  makeModerator: boolean
): Promise<Result<{ role: string }>> {
  if (actor.id === targetId) return fail("You cannot change your own role");
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true },
  });
  if (!target) return fail("That account no longer exists");
  const current = target.role as UserRole;

  if (makeModerator) {
    if (current === "FINANCE_MODERATOR") return fail("They are already a finance moderator");
    if (current !== "USER") {
      return fail("Only a regular user account can be made a finance moderator from here.");
    }
    const check = canAssignStaffRole(actor.role, "FINANCE_MODERATOR");
    if (!check.ok) return fail(check.reason);
    await prisma.user.update({ where: { id: target.id }, data: { role: "FINANCE_MODERATOR" } });
    return { ok: true, data: { role: "FINANCE_MODERATOR" } };
  }

  if (current !== "FINANCE_MODERATOR") return fail("That account is not a finance moderator");
  const admin = canAdministerStaffAccount(actor.role, current);
  if (!admin.ok) return fail(admin.reason);
  // Removing the role removes the grants with it: a former clerk keeping
  // "approve payments" as a leftover is exactly the access nobody remembers.
  await prisma.user.update({
    where: { id: target.id },
    data: { role: "USER", financeGrants: [] },
  });
  return { ok: true, data: { role: "USER" } };
}

/** Suspend or reactivate a finance moderator. */
export async function setModeratorStatus(
  actor: Actor,
  targetId: string,
  active: boolean
): Promise<Result<{ status: string }>> {
  if (actor.id === targetId) return fail("You cannot suspend yourself");
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!target) return fail("That account no longer exists");
  const check = canAdministerStaffAccount(actor.role, target.role as UserRole);
  if (!check.ok) return fail(check.reason);
  if (actor.role !== "SUPER_ADMIN" && target.role !== "FINANCE_MODERATOR") {
    return fail("You can only suspend finance moderators");
  }
  const status = active ? "ACTIVE" : "SUSPENDED";
  await prisma.user.update({ where: { id: targetId }, data: { status } });
  return { ok: true, data: { status } };
}
