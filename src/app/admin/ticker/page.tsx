import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Activity } from "lucide-react";
import { TickerSettingsForm } from "@/components/admin/ticker/ticker-settings-form";

export default async function WithdrawalTickerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ticker.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "ticker.edit");

  const rows = await prisma.systemSetting.findMany({
    where: { category: "ticker" },
  });
  const initial: Record<string, unknown> = {};
  for (const r of rows) initial[r.key.replace("ticker_", "")] = r.value;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-400" />
          Withdrawal Ticker
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure the live ticker shown on the user home feed.
        </p>
      </div>
      <TickerSettingsForm initial={initial} canEdit={canEdit} />
    </div>
  );
}
