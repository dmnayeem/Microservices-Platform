import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FolderPlus, AlertCircle } from "lucide-react";
import { CourseBuilder } from "@/components/admin/courses/course-builder/CourseBuilder";
import { loadCategoryOptions } from "@/lib/course-categories";

export default async function TutorNewCoursePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const categories = await loadCategoryOptions();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/tutor/courses"
          className="inline-flex items-center gap-1 text-xs text-(--app-ink-3) hover:text-white"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to my courses
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1">Build a new course</h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Step through the wizard at your own pace. Saving as draft is always
          safe — submit for review when you&apos;re ready.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-6 text-center">
          <FolderPlus className="w-8 h-8 text-amber-300 mx-auto mb-2" />
          <p className="text-white font-bold">No course categories yet</p>
          <p className="text-sm text-amber-100/80 mt-1">
            An admin needs to create at least one course category before tutors
            can publish. Hang tight!
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs text-amber-200">
            <AlertCircle className="w-3.5 h-3.5" />
            Ping an admin if this has been outstanding for a while.
          </div>
        </div>
      ) : (
        <CourseBuilder role="tutor" categories={categories} />
      )}
    </div>
  );
}
