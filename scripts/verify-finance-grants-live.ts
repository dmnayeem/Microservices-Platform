/**
 * The finance grant, end to end through the real permission resolver.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-finance-grants-live.ts
 *
 * `verify-finance-access.ts` proves the rules as pure functions. This proves the
 * wiring: that `getEffectivePermissions` actually reads `User.financeGrants`
 * from the database, that a MANAGER's per-user override naming a finance
 * permission is still stripped, and that `setFinanceGrants` refuses what the
 * actor may not grant. Every change is reverted at the end.
 */
import { prisma } from "./_q";
import { getEffectivePermissions } from "../src/lib/permissions";
import { setFinanceGrants } from "../src/lib/company-finance/team";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
  const staff = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "MODERATOR", "SUPPORT_ADMIN", "CONTENT_ADMIN", "MANAGER"] } },
    select: { id: true, role: true, financeGrants: true, permissionOverrides: true },
  });
  if (!superAdmin || !staff) {
    console.log("Need a super admin and one other staff account.");
    process.exit(1);
  }
  const original = { grants: staff.financeGrants, overrides: staff.permissionOverrides };

  try {
    console.log(`Staff account under test: ${staff.role}`);
    const before = await getEffectivePermissions(staff.id);
    check("starts with no finance access", !before.has("finance.view"));

    // What a manager could do through the per-user override editor.
    await prisma.user.update({
      where: { id: staff.id },
      data: { permissionOverrides: { "finance.view": true, "finance.entries.approve": true } },
    });
    const viaOverride = await getEffectivePermissions(staff.id);
    check(
      "an override naming finance is stripped by the resolver",
      !viaOverride.has("finance.view") && !viaOverride.has("finance.entries.approve")
    );
    await prisma.user.update({
      where: { id: staff.id },
      data: { permissionOverrides: (original.overrides ?? undefined) as never },
    });

    // The only way in: a super admin's grant.
    const g = await setFinanceGrants({ id: superAdmin.id, role: "SUPER_ADMIN" }, staff.id, ["finance.view"]);
    check("a super admin can grant it", g.ok, g.ok ? "" : g.error);
    const after = await getEffectivePermissions(staff.id);
    check("the resolver now gives finance.view", after.has("finance.view"));
    check("and nothing more", !after.has("finance.entries.approve") && !after.has("finance.hr.view"));

    const staffGrant = await setFinanceGrants(
      { id: superAdmin.id, role: "SUPER_ADMIN" },
      staff.id,
      ["finance.staff"]
    );
    check(
      "even a super admin cannot hand out 'manage the finance team' to non-finance staff",
      !staffGrant.ok,
      staffGrant.ok ? "granted!" : staffGrant.error
    );

    const bySelf = await setFinanceGrants({ id: staff.id, role: staff.role as never }, staff.id, ["finance.view"]);
    check("nobody can change their own finance access", !bySelf.ok);

    const byManager = await setFinanceGrants(
      { id: superAdmin.id, role: "MANAGER" },
      staff.id,
      ["finance.view"]
    );
    check("a manager cannot grant finance", !byManager.ok, byManager.ok ? "granted!" : byManager.error);
  } finally {
    await prisma.user.update({
      where: { id: staff.id },
      data: {
        financeGrants: original.grants,
        permissionOverrides: (original.overrides ?? undefined) as never,
      },
    });
    const restored = await prisma.user.findUnique({ where: { id: staff.id }, select: { financeGrants: true } });
    check("the account is restored exactly", JSON.stringify(restored?.financeGrants) === JSON.stringify(original.grants));
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
