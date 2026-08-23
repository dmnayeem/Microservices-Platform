import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Image as ImageIcon } from "lucide-react";
import { BannersClient } from "@/components/admin/banners/banners-client";

export default async function BannersAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "banners.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "banners.manage");
  const banners = await prisma.banner.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <ImageIcon className="w-6 h-6 text-pink-400" />
          Banner Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Promotional banners shown across user-facing pages.
        </p>
      </div>

      <BannersClient initial={banners} canManage={canManage} />
    </div>
  );
}
