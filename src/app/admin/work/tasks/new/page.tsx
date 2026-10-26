import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Briefcase } from "lucide-react";
import { TaskForm } from "@/components/admin/work/task-form";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "work.create"))) redirect("/admin");
  const sp = await searchParams;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/work" className="text-xs text-slate-400 hover:text-white">← Team Work</Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Briefcase className="h-6 w-6 text-blue-400" />
          New task
        </h1>
        <p className="mt-1 text-sm text-slate-400">Define the work, who does it, the target and who can see it.</p>
      </div>
      <TaskForm defaultProjectId={sp.project} />
    </div>
  );
}
