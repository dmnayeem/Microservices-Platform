import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SlidersHorizontal } from "lucide-react";
import { WorkSettings } from "@/components/admin/work/work-settings";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "work.settings"))) redirect("/admin");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/work" className="text-xs text-slate-400 hover:text-white">← Team Work</Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
          <SlidersHorizontal className="h-6 w-6 text-blue-400" />
          Work Settings
        </h1>
        <p className="mt-1 text-sm text-slate-400">Teams, Team Leads and the lists the task form offers.</p>
      </div>
      <WorkSettings />
    </div>
  );
}
