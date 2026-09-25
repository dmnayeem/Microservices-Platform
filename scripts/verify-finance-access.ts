/**
 * Who can see the company's money — asserted, not assumed.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-finance-access.ts
 *
 * The rule the owner set: nobody but a super admin and a finance admin sees
 * finance, UNLESS a super admin grants a specific person a specific permission.
 * A super admin or a finance admin may create finance moderators. A manager —
 * whose whole job is administering staff — may never touch any of it.
 *
 * Every case here is a pure function call, so this runs in a second and needs
 * no data.
 */
import {
  ROLE_PERMISSIONS,
  FINANCE_PERMISSIONS,
  stripProtectedForRole,
  canAdministerStaffAccount,
  canAssignStaffRole,
  type Permission,
  type UserRole,
} from "../src/lib/rbac";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/** What the resolver returns for a role, its base set, and a grant list. */
function effective(
  role: UserRole,
  opts: { extra?: Permission[]; grants?: string[] } = {}
): Set<Permission> {
  const base = new Set<Permission>([...(ROLE_PERMISSIONS[role] ?? []), ...(opts.extra ?? [])]);
  return stripProtectedForRole(base, role, opts.grants ?? []);
}

const finance = (s: Set<Permission>) => FINANCE_PERMISSIONS.filter((p) => s.has(p));

console.log("Nobody but super admin and finance admin sees finance by default");
for (const role of [
  "MANAGER",
  "ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
] as UserRole[]) {
  const f = finance(effective(role));
  check(`${role} holds no finance permission`, f.length === 0, f.join(", "));
}
check(
  "SUPER_ADMIN holds every finance permission",
  finance(effective("SUPER_ADMIN")).length === FINANCE_PERMISSIONS.length
);
check(
  "FINANCE_ADMIN holds every finance permission",
  finance(effective("FINANCE_ADMIN")).length === FINANCE_PERMISSIONS.length,
  `${finance(effective("FINANCE_ADMIN")).length}/${FINANCE_PERMISSIONS.length}`
);

console.log("\nA mis-saved role config or override cannot leak finance");
// What a MANAGER could do through the role editor or a per-user override.
const smuggled = effective("ADMIN", { extra: ["finance.view", "finance.entries.approve"] });
check("an ADMIN given finance via config/override is stripped", finance(smuggled).length === 0);
const smuggledMgr = effective("MANAGER", { extra: [...FINANCE_PERMISSIONS] });
check("a MANAGER given every finance permission is stripped", finance(smuggledMgr).length === 0);

console.log("\n...but a super admin's GRANT is honoured, one permission at a time");
const granted = effective("ADMIN", { grants: ["finance.view"] });
check("an ADMIN granted finance.view has it", granted.has("finance.view"));
check("and nothing else in finance", finance(granted).length === 1, finance(granted).join(", "));
check(
  "a grant naming a non-finance permission does nothing extra",
  !effective("MODERATOR", { grants: ["users.delete"] }).has("users.delete")
);

console.log("\nFinance moderator: a fixed ceiling, widened only by grants");
const mod = effective("FINANCE_MODERATOR");
check("sees the books", mod.has("finance.view"));
check("can record an expense", mod.has("finance.entries.create"));
check("cannot approve or pay", !mod.has("finance.entries.approve"));
check("cannot see salaries", !mod.has("finance.hr.view"));
check("cannot configure", !mod.has("finance.settings"));
check("cannot create other moderators", !mod.has("finance.staff"));
// A manager editing the moderator ROLE to add approval must not work.
const widenedByConfig = effective("FINANCE_MODERATOR", { extra: ["finance.entries.approve"] });
check(
  "the role matrix cannot widen a moderator past the ceiling",
  !widenedByConfig.has("finance.entries.approve")
);
const widenedByGrant = effective("FINANCE_MODERATOR", { grants: ["finance.entries.approve"] });
check("a grant CAN widen a moderator", widenedByGrant.has("finance.entries.approve"));

console.log("\nWho may administer a finance moderator account");
check("super admin may", canAdministerStaffAccount("SUPER_ADMIN", "FINANCE_MODERATOR").ok);
check("finance admin may", canAdministerStaffAccount("FINANCE_ADMIN", "FINANCE_MODERATOR").ok);
check("manager may NOT", !canAdministerStaffAccount("MANAGER", "FINANCE_MODERATOR").ok);
check("admin may NOT", !canAdministerStaffAccount("ADMIN", "FINANCE_MODERATOR").ok);
check(
  "finance admin may NOT touch another finance admin",
  !canAdministerStaffAccount("FINANCE_ADMIN", "FINANCE_ADMIN").ok
);
check(
  "finance admin may NOT touch a moderator of another kind",
  !canAdministerStaffAccount("FINANCE_ADMIN", "MODERATOR").ok
);

console.log("\nWho may hand out the role");
check("super admin may assign it", canAssignStaffRole("SUPER_ADMIN", "FINANCE_MODERATOR").ok);
check("finance admin may assign it", canAssignStaffRole("FINANCE_ADMIN", "FINANCE_MODERATOR").ok);
check("finance admin may take it away", canAssignStaffRole("FINANCE_ADMIN", "USER").ok);
check("manager may NOT assign it", !canAssignStaffRole("MANAGER", "FINANCE_MODERATOR").ok);
check(
  "finance admin may NOT mint another finance admin",
  !canAssignStaffRole("FINANCE_ADMIN", "FINANCE_ADMIN").ok
);
check("finance admin may NOT assign ADMIN", !canAssignStaffRole("FINANCE_ADMIN", "ADMIN").ok);

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
