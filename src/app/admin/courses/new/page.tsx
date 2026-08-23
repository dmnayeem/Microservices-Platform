import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { CourseBuilder } from "@/components/admin/courses/course-builder/CourseBuilder";
import { loadCategoryOptions } from "@/lib/course-categories";

export default async function CreateCoursePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "courses.manage"))) redirect("/admin/courses");

  const categories = await loadCategoryOptions();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/courses"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
        >
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Create course</h1>
          <p className="text-sm text-slate-400">
            Admin-created courses publish directly without tutor review.
          </p>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-6 text-center">
          <FolderPlus className="w-8 h-8 text-amber-300 mx-auto mb-2" />
          <p className="text-white font-bold">No course categories yet</p>
          <p className="text-sm text-amber-100/80 mt-1">
            Create at least one category at{" "}
            <Link
              href="/admin/courses/categories"
              className="text-amber-200 underline"
            >
              /admin/courses/categories
            </Link>{" "}
            before building courses.
          </p>
        </div>
      ) : (
        <CourseBuilder role="admin" categories={categories} />
      )}
    </div>
  );
}
