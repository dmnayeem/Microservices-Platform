import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import type { Permission, UserRole } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The gate every company-finance route goes through.
 *
 * One function, so no route can forget a check: it authenticates, resolves the
 * EFFECTIVE permission set (role + overrides, then `stripProtectedForRole`,
 * which is where the finance wall actually lives), and refuses with a sentence
 * rather than a bare 403 — a finance moderator who cannot approve a bill
 * should be told that, not that "access is forbidden".
 */
export type FinanceCaller = {
  id: string;
  role: UserRole;
  perms: Set<Permission>;
  can: (p: Permission) => boolean;
};

const WHY: Partial<Record<Permission, string>> = {
  "finance.view": "You do not have access to the company books.",
  "finance.entries.create": "You cannot record entries.",
  "finance.entries.approve": "Approving, paying and voiding need the 'Approve & pay expenses' permission.",
  "finance.hr.view": "Employee records and salaries need the 'View employees & salaries' permission.",
  "finance.hr.manage": "Changing employee records needs the 'Manage employees' permission.",
  "finance.settings": "Categories, custom fields and recurring bills need the 'Finance settings' permission.",
  "finance.staff": "Only a super admin or a finance admin manages the finance team.",
};

export async function financeGuard(
  need: Permission | Permission[]
): Promise<{ caller: FinanceCaller } | { res: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const perms = await getEffectivePermissions(session.user.id);
  const needs = Array.isArray(need) ? need : [need];
  const missing = needs.find((p) => !perms.has(p));
  if (missing) {
    return { res: NextResponse.json({ error: WHY[missing] ?? "Forbidden" }, { status: 403 }) };
  }
  return {
    caller: {
      id: session.user.id,
      role: (session.user.role ?? "USER") as UserRole,
      perms,
      can: (p) => perms.has(p),
    },
  };
}

/** A library `Result` → a response. Errors are 400 with the sentence. */
export function reply<T>(r: { ok: true; data: T } | { ok: false; error: string }, status = 200) {
  return r.ok
    ? NextResponse.json({ ok: true, ...(r.data as object) }, { status })
    : NextResponse.json({ error: r.error }, { status: 400 });
}

/**
 * Salary rows are hidden from anyone without `finance.hr.view`.
 *
 * A clerk with "see the books" but not "see salaries" would otherwise read
 * every person's pay straight off the expense list — the list IS the salary
 * sheet, one row per person per month. Hidden by who it was paid to and by the
 * categories that exist to hold pay, so a salary typed in by hand under
 * "Salaries" is hidden as well as one the salary screen wrote.
 */
export const PAY_CATEGORY_SLUGS = ["salary", "commission", "office-staff"];

export function hideSalariesWhere(caller: FinanceCaller): Prisma.FinanceEntryWhereInput {
  if (caller.can("finance.hr.view")) return {};
  return {
    employeeId: null,
    source: { not: "SALARY" },
    category: { slug: { notIn: PAY_CATEGORY_SLUGS } },
  };
}

/** Every write is audited under one prefix, so the activity log can filter it. */
export function auditFinance(
  caller: FinanceCaller,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  meta?: Record<string, unknown>
) {
  return writeAudit({
    actorId: caller.id,
    action: `FINANCE_${action}`,
    entity,
    entityId,
    summary,
    ...(meta ? { meta } : {}),
  });
}
