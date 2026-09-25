import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Permission } from "@/lib/rbac";

/**
 * Every printed document checks the same permission its screen does. A printout
 * leaves the building — a salary sheet on a desk is the salary list without the
 * login — so "can print it" must never be wider than "can see it".
 */
export async function printGuard(...need: Permission[]) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const perms = await getEffectivePermissions(session.user.id);
  if (!need.every((p) => perms.has(p))) redirect("/admin/finance/company");
  return {
    userId: session.user.id,
    name: session.user.name ?? session.user.email ?? null,
    can: (p: Permission) => perms.has(p),
  };
}
