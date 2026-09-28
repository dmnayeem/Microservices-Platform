import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Megaphone } from "lucide-react";
import { PopupsClient } from "@/components/admin/popups/popups-client";

export default async function PopupsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "banners.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "banners.manage");
  const popups = await prisma.sitePopup.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-amber-400" />
          Popups
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Notices, images and ads that open over the site — for the pages, people and dates you choose.
        </p>
      </div>
      <PopupsClient initial={popups} canManage={canManage} />
    </div>
  );
}
