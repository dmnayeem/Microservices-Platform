import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toNumOrNull } from "@/lib/money";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { Tag } from "lucide-react";
import Link from "next/link";
import { CouponsAdmin } from "./_components/CouponsAdmin";

export default async function AdminCouponsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as UserRole | undefined;
  if (!hasPermission(role, "courses.view")) redirect("/admin");

  const [couponsRaw, categories, courses] = await Promise.all([
    prisma.courseCoupon.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.courseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
      take: 500,
    }),
  ]);

  const canManage = hasPermission(role, "courses.manage");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <Link href="/admin/courses" className="hover:text-white">
              ← Courses
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 mt-1">
            <Tag className="w-6 h-6 text-indigo-300" />
            Coupons
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Run promo codes against any course, a category, or specific courses.
          </p>
        </div>
      </div>

      <CouponsAdmin
        initial={couponsRaw.map((c) => ({
          ...c,
          minPurchase: toNumOrNull(c.minPurchase),
        })) as unknown as Array<{
          id: string;
          code: string;
          type: "PERCENT" | "FIXED";
          value: number;
          scope: "ALL" | "CATEGORY" | "SPECIFIC_COURSES";
          categoryIds: string[];
          courseIds: string[];
          minPurchase: number | null;
          maxRedemptions: number | null;
          redemptionsCount: number;
          perUserLimit: number;
          validFrom: Date;
          validUntil: Date | null;
          isActive: boolean;
          createdAt: Date;
        }>}
        categories={categories}
        courses={courses}
        canManage={canManage}
      />
    </div>
  );
}
