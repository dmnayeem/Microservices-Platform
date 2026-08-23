import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { type UserRole } from "@/lib/rbac";
import { can } from "@/lib/permissions";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { UserEditForm } from "@/components/admin/users/edit-user-modal";
import {
  UserDetailActions,
  AdjustBalanceButton,
} from "@/components/admin/user-detail-actions";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!(await can(session.user.id, "users.edit"))) {
    redirect(`/admin/users`);
  }

  const { id } = await params;
  const [userRaw, plans, customRolesRaw] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        phone: true,
        role: true,
        customRoleId: true,
        status: true,
        level: true,
        xp: true,
        pointsBalance: true,
        cashBalance: true,
        packageId: true,
        packageExpiresAt: true,
        featureOverrides: true,
        permissionOverrides: true,
        pageOverrides: true,
        kycStatus: true,
        twoFactorEnabled: true,
        tutorProfile: { select: { isSuspended: true } },
        isBlueVerified: true,
        verifiedBadgeStyle: true,
        gender: true,
        dateOfBirth: true,
        nidNumber: true,
        profession: true,
        maritalStatus: true,
        studyLevel: true,
        nationality: true,
        bloodGroup: true,
        secondaryEmail: true,
        secondaryPhone: true,
        bio: true,
        avatar: true,
        coverPhoto: true,
        country: true,
        region: true,
        division: true,
        subDivision: true,
        district: true,
        subDistrict: true,
        city: true,
        village: true,
        street: true,
        postalCode: true,
      },
    }),
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { accessLevel: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
    prisma.customRole.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!userRaw) notFound();

  // Normalize Prisma Accelerate's stringified DateTime back to Date for the
  // UserEditForm prop shape.
  const { tutorProfile, ...userRest } = userRaw;
  const user = {
    ...userRest,
    cashBalance: toNum(userRaw.cashBalance),
    dateOfBirth: userRaw.dateOfBirth ? new Date(userRaw.dateOfBirth) : null,
    packageExpiresAt: userRaw.packageExpiresAt
      ? new Date(userRaw.packageExpiresAt)
      : null,
    featureOverrides: (userRaw.featureOverrides ?? null) as
      | Record<string, boolean>
      | null,
    permissionOverrides: (userRaw.permissionOverrides ?? null) as
      | Record<string, boolean>
      | null,
    pageOverrides: (userRaw.pageOverrides ?? null) as
      | Record<string, boolean>
      | null,
    // Flatten the tutor relation so the form can show a sell-courses suspend
    // toggle only for users that actually have a TutorProfile.
    hasTutorProfile: tutorProfile != null,
    tutorSuspended: tutorProfile?.isSuspended ?? false,
  };

  const isSuperAdmin = adminRole === "SUPER_ADMIN";
  // `can()` (effective: role table + custom role + per-user overrides) — the
  // API gates on this, and gating the page on the static role table instead
  // rendered buttons that then 403'd for custom-role admins.
  const canBalance = await can(session.user.id, "users.adjust_balance");

  const BALANCE_FIELDS = [
    { key: "points" as const, value: user.pointsBalance },
    { key: "cash" as const, value: user.cashBalance },
    { key: "level" as const, value: user.level },
    { key: "xp" as const, value: user.xp },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link
        href={`/admin/users/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to user detail
      </Link>

      {/* One-stop per-user action bar (feature #8) — every account action is
          reachable from the edit screen, reusing the detail-page components. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <UserDetailActions
          userId={id}
          userName={user.name}
          userEmail={user.email}
          userStatus={user.status}
          canEdit={false}
          canBan={await can(session.user.id, "users.ban") && user.role !== "SUPER_ADMIN"}
          canDelete={await can(session.user.id, "users.delete") && user.role !== "SUPER_ADMIN"}
          canApprove={
            await can(session.user.id, "users.edit") &&
            (user.role !== "SUPER_ADMIN" || isSuperAdmin)
          }
          canImpersonate={
            isSuperAdmin &&
            user.role !== "SUPER_ADMIN" &&
            user.id !== session.user.id
          }
        />
        {canBalance && (
          <div className="flex flex-wrap items-center gap-2 border-l border-slate-800 pl-3">
            {BALANCE_FIELDS.map(({ key, value }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1"
              >
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  {key}
                </span>
                {/* The current value. Without it there was nothing on this row
                    that changed after an adjustment, which is why the buttons
                    read as broken — they always worked. */}
                <span className="text-sm font-bold text-white tabular-nums">
                  {key === "cash" ? usd(value) : value.toLocaleString()}
                </span>
                <AdjustBalanceButton
                  userId={id}
                  type={key}
                  action="add"
                  canAdjust
                  currentValue={value}
                />
                <AdjustBalanceButton
                  userId={id}
                  type={key}
                  action="deduct"
                  canAdjust
                  currentValue={value}
                />
              </span>
            ))}
          </div>
        )}
        {await can(session.user.id, "users.edit") && (
          <Link
            href={`/admin/users/${id}/boost-followers`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Follower / display boost
          </Link>
        )}
      </div>

      <UserEditForm
        user={user}
        isSuperAdmin={isSuperAdmin}
        plans={plans}
        customRoles={customRolesRaw}
      />
    </div>
  );
}
