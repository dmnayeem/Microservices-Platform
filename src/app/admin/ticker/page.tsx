import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getTickerConfig } from "@/lib/ticker-server";
import { Activity } from "lucide-react";
import { TickerSettingsForm } from "@/components/admin/ticker/ticker-settings-form";

export default async function WithdrawalTickerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "ticker.view"))) redirect("/admin");

  const canEdit = await can(session.user.id, "ticker.edit");

  // The same resolved config the feed uses — defaults included — so the form
  // never shows a value the feed is not actually using.
  const initial = await getTickerConfig();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-400" />
          Withdrawal Ticker
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          The scrolling “who just withdrew” bar on the social feed. Choose real payouts, generated entries, or both.
        </p>
      </div>
      <TickerSettingsForm initial={initial} canEdit={canEdit} />
    </div>
  );
}
