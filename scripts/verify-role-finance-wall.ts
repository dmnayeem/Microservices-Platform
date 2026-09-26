/**
 * The line of command (Super Admin > Manager > Admin > Moderator) and the finance
 * wall: no one outside Super Admin / Finance Admin holds money access unless a
 * super admin granted it by name. Against the real database; one throwaway
 * MANAGER is created and deleted.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-role-finance-wall.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { getEffectivePermissions } from "../src/lib/permissions";
import { ROLE_PERMISSIONS, FINANCE_PERMISSIONS } from "../src/lib/rbac";
let failed = 0;
const check = (n: string, ok: boolean, info?: unknown) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${n}${!ok && info !== undefined ? " → " + JSON.stringify(info) : ""}`); if (!ok) failed++; };
const FIN = new Set<string>(FINANCE_PERMISSIONS);
(async () => {
  const M = new Set(ROLE_PERMISSIONS.MANAGER), A = new Set(ROLE_PERMISSIONS.ADMIN), O = new Set(ROLE_PERMISSIONS.MODERATOR);
  check("hierarchy: moderator ⊂ admin", [...O].every((p) => A.has(p)));
  check("hierarchy: admin (minus finance) ⊂ manager", [...A].filter((p) => !FIN.has(p)).every((p) => M.has(p)));
  check("balance adjustment is a finance permission", FIN.has("users.adjust_balance"));
  check("the finance admin holds it by default", ROLE_PERMISSIONS.FINANCE_ADMIN.includes("users.adjust_balance" as never));
  const tag = `rbac-${Date.now()}`;
  const mgr = await prisma.user.create({ data: { email: `${tag}@verify.invalid`, name: tag, referralCode: tag, role: "MANAGER", status: "ACTIVE", permissionOverrides: { "finance.view": true, "users.adjust_balance": true } as never }, select: { id: true } });
  try {
    const p = await getEffectivePermissions(mgr.id);
    check("a MANAGER who ticked finance on themselves still has none", ![...p].some((x) => FIN.has(x)), [...p].filter((x) => FIN.has(x)));
    check("a MANAGER keeps staff administration", p.has("admins.manage"));
    await prisma.user.update({ where: { id: mgr.id }, data: { financeGrants: ["finance.view"] } });
    const p2 = await getEffectivePermissions(mgr.id);
    check("a super admin's named grant does give it", p2.has("finance.view") && !p2.has("users.adjust_balance"));
  } finally {
    await prisma.user.delete({ where: { id: mgr.id } });
  }
  const staff = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER", "MODERATOR", "CONTENT_ADMIN", "SUPPORT_ADMIN", "MARKETING_ADMIN"] } }, select: { id: true, email: true, role: true } });
  let leaks: string[] = [];
  for (const s of staff) {
    const p = await getEffectivePermissions(s.id);
    const f = [...p].filter((x) => FIN.has(x));
    if (f.length) leaks.push(`${s.email}:${f.join(",")}`);
  }
  check(`no real admin / manager / moderator holds a finance permission (${staff.length} checked)`, leaks.length === 0, leaks);
  console.log(failed ? `${failed} FAILED` : "All checks passed.");
  process.exit(failed ? 1 : 0);
})();
