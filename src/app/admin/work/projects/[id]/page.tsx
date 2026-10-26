import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { FolderKanban } from "lucide-react";
import { ProjectDetail } from "@/components/admin/work/project-detail";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "work.view"))) redirect("/admin");
  const { id } = await params;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/work?tab=projects" className="text-xs text-slate-400 hover:text-white">← Team Work</Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
          <FolderKanban className="h-6 w-6 text-blue-400" />
          Project
        </h1>
        <p className="mt-1 text-sm text-slate-400">Milestones, tasks and progress.</p>
      </div>
      <ProjectDetail projectId={id} />
    </div>
  );
}
