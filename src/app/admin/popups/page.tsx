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
  const [popups, packages] = await Promise.all([
    prisma.sitePopup.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    // For the "which plans" rule.
    prisma.package.findMany({
      where: { isActive: true },
      orderBy: [{ accessLevel: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-amber-400" />
          Popups
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Notices, images, videos, HTML/ad code and offers that open over the site — on the pages, for the
          people and on the dates you choose.
        </p>
      </div>
      <PopupsClient initial={popups} canManage={canManage} packages={packages} />
    </div>
  );
}
