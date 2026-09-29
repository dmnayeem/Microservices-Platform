import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, ROLE_PERMISSIONS, type UserRole } from "@/lib/rbac";
import { getPageVisibilityRules } from "@/lib/page-visibility-server";
import { getSetting } from "@/lib/system-settings";
import { FEATURES } from "@/lib/features";
import { packageHasFeature, type PackageRow } from "@/lib/packages";
import { AdminTabs, pickTab, type AdminTab } from "@/components/admin/ui/admin-tabs";
import { VisibilityMatrix } from "@/components/admin/visibility/visibility-matrix";
import { UserVisibilityPanel } from "@/components/admin/visibility/user-visibility-panel";
import { TaskCategoriesForm } from "@/components/admin/tasks/task-categories-form";

const TABS: AdminTab[] = [
  { id: "pages", label: "Pages" },
  { id: "features", label: "Features" },
  { id: "categories", label: "Task categories" },
  { id: "user", label: "Per user" },
];

/** "SUPPORT_ADMIN" → "Support Admin". */
function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function VisibilityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  // Platform-wide visibility is a super-admin-only control.
  if (!isSuperAdmin(role)) redirect("/admin");

  const tab = pickTab(TABS, (await searchParams).tab);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Visibility</h1>
        <p className="text-slate-400 text-sm mt-1">
          Hide any user page or feature — for everyone, per package, per role,
          or for one person. Security pages (settings, 2FA, password) can never
          be hidden.
        </p>
      </div>
      <AdminTabs tabs={TABS} active={tab} basePath="/admin/visibility" />
      {tab === "pages" && <PagesTab />}
      {tab === "features" && <FeaturesTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "user" && <UserVisibilityPanel />}
    </div>
  );
}

async function PagesTab() {
  const [packages, rules] = await Promise.all([
    prisma.package.findMany({
      select: { slug: true, name: true },
      orderBy: { accessLevel: "asc" },
    }),
    getPageVisibilityRules(),
  ]);
  // Every role, straight from the RBAC table — a role added there shows up
  // here without anyone remembering to edit a second list.
  const roles = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((r) => ({
    key: r,
    label: roleLabel(r),
  }));
  return <VisibilityMatrix packages={packages} roles={roles} initialRules={rules} />;
}

async function FeaturesTab() {
  const packages = (await prisma.package.findMany({
    orderBy: { accessLevel: "asc" },
  })) as unknown as (PackageRow & { id: string; name: string })[];

  const groups: [string, typeof FEATURES][] = [];
  for (const f of FEATURES) {
    const g =
      f.group === "section"
        ? "Sections"
        : f.group === "creator"
          ? "Creator & monetization"
          : "Task types";
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(f);
    else groups.push([g, [f]]);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        What each plan includes. Read-only here — click a plan to edit it. To
        open or close a feature for one person, use the{" "}
        <Link href="/admin/visibility?tab=user" className="text-indigo-400 hover:underline">
          Per user
        </Link>{" "}
        tab.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-900">
              <th className="sticky left-0 z-10 bg-slate-900 text-left px-3 py-2 font-semibold text-slate-300 min-w-[160px]">
                Feature
              </th>
              {packages.map((p) => (
                <th key={p.id} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                  <Link
                    href={`/admin/packages/${p.id}/edit`}
                    className="text-indigo-300 hover:text-white hover:underline"
                  >
                    {p.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, items]) => (
              <GroupRows key={group} group={group} span={packages.length + 1}>
                {items.map((f) => (
                  <tr key={f.key} className="border-t border-slate-800/60">
                    <td className="sticky left-0 z-10 bg-slate-950 px-3 py-2 text-white">
                      <span className="whitespace-nowrap">{f.label}</span>
                      <span className="block text-[10px] text-slate-500 max-w-[220px]">
                        {f.description}
                      </span>
                    </td>
                    {packages.map((p) => {
                      const on = packageHasFeature(p, f.key);
                      return (
                        <td key={p.id} className="px-2 py-2 text-center">
                          <span
                            className={on ? "text-emerald-400" : "text-slate-600"}
                            aria-label={on ? "included" : "not included"}
                          >
                            {on ? "✓" : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  span,
  children,
}: {
  group: string;
  span: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="bg-slate-950/60">
        <td
          colSpan={span}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"
        >
          {group}
        </td>
      </tr>
      {children}
    </>
  );
}

async function CategoriesTab() {
  const initial = await getSetting<Record<string, boolean>>(
    "tasks.category_visibility",
    {}
  );
  // Same editor and setting as /admin/task-categories. The super admin (the
  // only one who reaches this page) always holds tasks.edit.
  return <TaskCategoriesForm initial={initial} canManage />;
}
