/**
 * Admin-page (module) rules — asserted on the pure decision the layout, the
 * sidebar and `can()` all use. No data needed.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-admin-module-rules.ts
 */
import {
  ADMIN_MODULES,
  ROLE_PERMISSIONS,
  FINANCE_PERMISSIONS,
  SUPERADMIN_ONLY_PERMISSIONS,
  stripProtectedForRole,
  moduleForPath,
  type Permission,
  type UserRole,
} from "../src/lib/rbac";
import {
  decideModule,
  parseAdminModuleRules,
  parseModuleOverrides,
  permissionsGrantedByModules,
  moduleForApiPath,
  API_MODULE_PREFIXES,
} from "../src/lib/admin-module-rules";

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}
const mod = (href: string) => {
  const m = ADMIN_MODULES.find((x) => x.href === href);
  if (!m) throw new Error(`no module ${href}`);
  return m;
};
const perms = (role: UserRole) => stripProtectedForRole(new Set(ROLE_PERMISSIONS[role]), role, []);

const rules = parseAdminModuleRules({
  disabled: ["/admin/lottery", "/admin", "/nope"],
  roles: { MANAGER: ["/admin/games"], SUPER_ADMIN: ["/admin/users"], ADMIN: ["/admin/blog"] },
});
check("unknown hrefs, the dashboard and SUPER_ADMIN are never stored",
  rules.disabled.join() === "/admin/lottery" && !("SUPER_ADMIN" in rules.roles));

const SA = perms("SUPER_ADMIN");
check("super admin sees every module, whatever the rules",
  ADMIN_MODULES.every((m) => decideModule(m, "SUPER_ADMIN", SA, rules, { [m.href]: "hide" }).visible));

const M = perms("MANAGER");
check("off-for-all hides from a manager", !decideModule(mod("/admin/lottery"), "MANAGER", M, rules, {}).visible);
check("role rule hides from that role", decideModule(mod("/admin/games"), "MANAGER", M, rules, {}).source === "role");
check("role rule does not touch another role",
  decideModule(mod("/admin/games"), "ADMIN", perms("ADMIN"), rules, {}).source !== "role");
check("per-admin show beats off-for-all",
  decideModule(mod("/admin/lottery"), "MANAGER", M, rules, { "/admin/lottery": "show" }).visible);
check("per-admin hide beats the permission",
  !decideModule(mod("/admin/tasks"), "MANAGER", M, rules, { "/admin/tasks": "hide" }).visible);
check("/admin/visibility is super-admin only — a MANAGER no longer sees it",
  M.has("admins.manage") && !decideModule(mod("/admin/visibility"), "MANAGER", M, rules, {}).visible);
check("…and a per-admin show cannot grant it",
  Object.keys(parseModuleOverrides({ "/admin/visibility": "show", "/admin": "hide" })).length === 0);
check("/admin/offerwall-callbacks is a module owning its path",
  moduleForPath("/admin/offerwall-callbacks/x")?.href === "/admin/offerwall-callbacks");

// A "show" never leaks finance or staff administration.
const shown = permissionsGrantedByModules({ "/admin/finance": "show", "/admin/access": "show", "/admin/withdrawals": "show" });
const modPerms = new Set<Permission>(ROLE_PERMISSIONS.MODERATOR);
for (const p of shown) modPerms.add(p);
const eff = stripProtectedForRole(modPerms, "MANAGER", []);
check("a shown finance page adds no finance permission without a grant",
  !FINANCE_PERMISSIONS.some((p) => eff.has(p)), FINANCE_PERMISSIONS.filter((p) => eff.has(p)));
check("a shown page never adds super-admin-only permissions",
  !SUPERADMIN_ONLY_PERMISSIONS.some((p) => shown.includes(p)));

check("API prefixes map to real modules",
  Object.values(API_MODULE_PREFIXES).every((h) => ADMIN_MODULES.some((m) => m.href === h)));
check("longest API prefix wins", moduleForApiPath("/api/admin/offerwall-callbacks/1") === "/admin/offerwall-callbacks"
  && moduleForApiPath("/api/admin/offerwalls/x") === "/admin/offerwalls"
  && moduleForApiPath("/api/admin/users/1") === null);

console.log(failed ? `${failed} FAILED` : "All checks passed.");
process.exit(failed ? 1 : 0);
