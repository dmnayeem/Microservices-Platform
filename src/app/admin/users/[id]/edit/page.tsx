import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { toNum } from "@/lib/money";
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
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "users.edit")) {
    redirect(`/admin/users`);
  }

  const { id } = await params;
  const [userRaw, plans] = await Promise.all([
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
        status: true,
        level: true,
        xp: true,
        pointsBalance: true,
        cashBalance: true,
        packageId: true,
        packageExpiresAt: true,
        featureOverrides: true,
        permissionOverrides: true,
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
    // Flatten the tutor relation so the form can show a sell-courses suspend
    // toggle only for users that actually have a TutorProfile.
    hasTutorProfile: tutorProfile != null,
    tutorSuspended: tutorProfile?.isSuspended ?? false,
  };

  const isSuperAdmin = adminRole === "SUPER_ADMIN";
  const canBalance = hasPermission(adminRole, "users.adjust_balance");

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
          canBan={hasPermission(adminRole, "users.ban")}
          canDelete={hasPermission(adminRole, "users.delete")}
          canApprove={hasPermission(adminRole, "users.edit")}
          canImpersonate={
            isSuperAdmin &&
            user.role !== "SUPER_ADMIN" &&
            user.id !== session.user.id
          }
        />
        {canBalance && (
          <div className="flex items-center gap-3 border-l border-slate-800 pl-3">
            {(["points", "cash", "level", "xp"] as const).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-xs text-slate-400"
              >
                <span className="uppercase tracking-wide">{t}</span>
                <AdjustBalanceButton userId={id} type={t} action="add" canAdjust />
                <AdjustBalanceButton userId={id} type={t} action="deduct" canAdjust />
              </span>
            ))}
          </div>
        )}
        {hasPermission(adminRole, "users.edit") && (
          <Link
            href={`/admin/users/${id}/boost-followers`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            Follower / display boost
          </Link>
        )}
      </div>

      <UserEditForm user={user} isSuperAdmin={isSuperAdmin} plans={plans} />
    </div>
  );
}
