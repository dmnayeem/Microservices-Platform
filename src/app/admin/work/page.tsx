import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Briefcase } from "lucide-react";
import { WorkApp } from "@/components/admin/work/work-app";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "work.view"))) redirect("/admin");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Briefcase className="h-6 w-6 text-blue-400" />
          Team Work
        </h1>
        <p className="mt-1 text-sm text-slate-400">Projects, tasks, targets and progress reports for the team.</p>
      </div>
      <WorkApp />
    </div>
  );
}
