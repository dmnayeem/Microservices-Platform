import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FolderTree } from "lucide-react";
import Link from "next/link";
import { CategoryManager } from "./_components/CategoryManager";

export default async function CourseCategoriesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "courses.view"))) redirect("/admin");

  const rowsRaw = await prisma.courseCategory.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      subcategories: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
      _count: { select: { courses: true } },
    },
  });

  const rows = rowsRaw as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    iconKey: string | null;
    color: string | null;
    order: number;
    isActive: boolean;
    _count: { courses: number };
  }>;

  const canManage = await can(session.user.id, "courses.manage");

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <Link href="/admin/courses" className="hover:text-white">
            ← Courses
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2 mt-1">
          <FolderTree className="w-6 h-6 text-indigo-300" />
          Course categories
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Course categories drive browse filters and per-category commission
          overrides. Slugs are used in URLs and settings keys — keep them stable.
        </p>
      </div>

      <CategoryManager
        initial={rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          description: r.description,
          iconKey: r.iconKey,
          color: r.color,
          order: r.order,
          isActive: r.isActive,
          courseCount: r._count.courses,
        }))}
        canManage={canManage}
      />
    </div>
  );
}
