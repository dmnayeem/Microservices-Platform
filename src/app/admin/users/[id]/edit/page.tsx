import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { toNum } from "@/lib/money";
import { UserEditForm } from "@/components/admin/users/edit-user-modal";

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
        featureOverrides: true,
        kycStatus: true,
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
  const user = {
    ...userRaw,
    cashBalance: toNum(userRaw.cashBalance),
    dateOfBirth: userRaw.dateOfBirth ? new Date(userRaw.dateOfBirth) : null,
    featureOverrides: (userRaw.featureOverrides ?? null) as
      | Record<string, boolean>
      | null,
  };

  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link
        href={`/admin/users/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to user detail
      </Link>

      <UserEditForm user={user} isSuperAdmin={isSuperAdmin} plans={plans} />
    </div>
  );
}
