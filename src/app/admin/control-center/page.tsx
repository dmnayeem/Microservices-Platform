import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BookOpen,
  Eye,
  FolderTree,
  Key,
  Landmark,
  PanelsTopLeft,
  Shield,
  UserCog,
  UserSearch,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { parsePermissionOverrides } from "@/lib/rbac";
import { parseModuleOverrides } from "@/lib/admin-module-rules";
import { StaffAccessManager, type StaffRow } from "@/components/admin/control-center/staff-access-manager";
import { FeatureSwitches } from "@/components/admin/control-center/feature-switches";
import { ImpersonationPanel } from "@/components/admin/control-center/impersonation-panel";
import { loadFeatureSwitches, SWITCH_GROUPS } from "@/lib/control-center-switches";

/**
 * Control Center — every access switch in one place (owner, 2026-10-05).
 *
 * Access was spread over five screens and five storage places. This page does
 * not replace them; it lists every one with what it controls, and puts the
 * thing the owner does most — deciding what one admin may do — on this page:
 * pick an admin, see where each of their permissions comes from, allow or
 * block it, including the hand adjustments (points, cash, XP, level,
 * followers) one by one. Super admin only.
 */
export const dynamic = "force-dynamic";

const CONTROLS = [
  {
    href: "/admin/access?view=roles",
    icon: Key,
    title: "Roles & permissions",
    body: "What each role (Admin, Support, Moderator…) can do by default, and custom roles.",
    tone: "text-sky-400 bg-sky-500/10",
  },
  {
    href: "/admin/access?view=pages",
    icon: PanelsTopLeft,
    title: "Admin pages on / off",
    body: "Turn an admin page off for everyone or for a role.",
    tone: "text-violet-400 bg-violet-500/10",
  },
  {
    href: "/admin/visibility",
    icon: Eye,
    title: "User pages & features",
    body: "Hide pages and features from users — everyone, per plan, per role or per person.",
    tone: "text-emerald-400 bg-emerald-500/10",
  },
  {
    href: "/admin/visibility?tab=user",
    icon: UserSearch,
    title: "One user's pages & features",
    body: "Open or close pages and features for a single person, and see why they see what they see.",
    tone: "text-teal-400 bg-teal-500/10",
  },
  {
    href: "/admin/visibility?tab=categories",
    icon: FolderTree,
    title: "Task categories",
    body: "Which task categories users can see.",
    tone: "text-amber-400 bg-amber-500/10",
  },
  {
    href: "/admin/finance/company",
    icon: Landmark,
    title: "Finance team",
    body: "Finance moderators and their money permissions (Finance team tab).",
    tone: "text-rose-400 bg-rose-500/10",
  },
  {
    href: "/admin/access",
    icon: UserCog,
    title: "Admin accounts",
    body: "Create, promote or remove staff accounts.",
    tone: "text-cyan-400 bg-cyan-500/10",
  },
  {
    href: "/admin/access?view=catalog",
    icon: BookOpen,
    title: "What everything does",
    body: "Every permission and page, explained.",
    tone: "text-slate-300 bg-slate-500/10",
  },
  {
    href: "/admin/admin-activity",
    icon: Activity,
    title: "Admin activity log",
    body: "Who changed what, including every access change.",
    tone: "text-orange-400 bg-orange-500/10",
  },
];

export default async function ControlCenterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "SUPER_ADMIN") redirect("/admin");

  // Typed up front: inline, these literals defeat the select's inference.
  // Every admin-panel role (ADMIN_ROLES) except the super admin, who always has everything.
  const staffWhere: Prisma.UserWhereInput = { role: { notIn: ["USER", "TUTOR", "AGENCY", "SUPER_ADMIN"] } };
  const staffOrder: Prisma.UserOrderByWithRelationInput[] = [{ role: "asc" }, { name: "asc" }];
  const [staff, switches] = await Promise.all([prisma.user.findMany({
    where: staffWhere,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      permissionOverrides: true,
      financeGrants: true,
      moduleOverrides: true,
      customRole: { select: { name: true, isActive: true } },
    },
    orderBy: staffOrder,
    take: 500,
  }), loadFeatureSwitches()]);

  const rows: StaffRow[] = staff.map((u) => {
    const ov = parsePermissionOverrides(u.permissionOverrides);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      customRole: u.customRole?.isActive ? u.customRole.name : null,
      granted: Object.values(ov).filter(Boolean).length,
      blocked: Object.values(ov).filter((v) => !v).length,
      finance: (u.financeGrants ?? []).length,
      pages: Object.keys(parseModuleOverrides(u.moduleOverrides)).length,
    };
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/30 bg-linear-to-br from-amber-500/10 via-slate-900 to-slate-900 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
            <Shield className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">Control Center</h1>
            <p className="text-sm text-slate-400">
              Every access control in one place. You (super admin) always have everything; here you decide
              what each admin gets.
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">
          All controls
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CONTROLS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-600"
            >
              <span className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${c.tone}`}>
                <c.icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-white group-hover:underline">{c.title}</p>
              <p className="mt-1 text-xs text-slate-400">{c.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">
          Staff access
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Pick an admin to allow or block anything for them alone — on top of what their role gives.
        </p>
        <StaffAccessManager staff={rows} />
      </section>

      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">
          Login as user
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Who may sign in to a user&apos;s account from their admin page, and which accounts no one may sign in to.
        </p>
        <ImpersonationPanel
          staff={staff
            .filter((u) => u.status === "ACTIVE")
            .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))}
        />
      </section>

      <section>
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">
          Feature switches
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Every on/off platform setting, grouped. The same switches as on System Settings and each
          feature&apos;s own page — flipping one here changes it there too. Every change is in the admin
          activity log.
        </p>
        <FeatureSwitches initial={switches} groups={SWITCH_GROUPS} />
      </section>
    </div>
  );
}
