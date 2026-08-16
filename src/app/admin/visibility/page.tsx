import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, type UserRole } from "@/lib/rbac";
import { getPageVisibilityRules } from "@/lib/page-visibility-server";
import { VisibilityMatrix } from "@/components/admin/visibility/visibility-matrix";

export default async function VisibilityAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  // Platform-wide visibility is a super-admin-only control.
  if (!isSuperAdmin(role)) redirect("/admin");

  const [packages, rules] = await Promise.all([
    prisma.package.findMany({
      select: { slug: true, name: true },
      orderBy: { accessLevel: "asc" },
    }),
    getPageVisibilityRules(),
  ]);

  return <VisibilityMatrix packages={packages} initialRules={rules} />;
}
