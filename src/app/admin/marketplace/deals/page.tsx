import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { formatDistanceToNow } from "date-fns";
import { Handshake, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ORDER_SENDER_TYPE, parseOrderBrief, type OrderBrief } from "@/lib/service-packages";

const STATUS_STYLE: Record<string, string> = {
  FUNDED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  DELIVERED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  DISPUTED: "bg-red-500/15 text-red-300 border-red-500/30",
  RELEASED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  REFUNDED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export default async function AdminDealsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "marketplace.mediate"))) redirect("/admin");

  const deals = await prisma.marketplaceDeal.findMany({
    where: { OR: [{ adminMediated: true }, { status: "DISPUTED" }] },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  const userIds = Array.from(new Set(deals.flatMap((d) => [d.buyerId, d.sellerId])));
  const listingIds = Array.from(new Set(deals.map((d) => d.listingId)));
  const [users, listings, briefMsgs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } }),
    // Service orders: the package ordered + the buyer's requirement answers.
    prisma.marketplaceThreadMessage.findMany({
      where: { threadId: { in: Array.from(new Set(deals.map((d) => d.threadId))) }, senderType: ORDER_SENDER_TYPE },
      select: { body: true },
    }),
  ]);
  const briefs = new Map<string, OrderBrief>();
  for (const m of briefMsgs) {
    const b = parseOrderBrief(m.body);
    if (b) briefs.set(b.dealId, b);
  }
  const userMap = new Map(users.map((u) => [u.id, u]));
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const openCount = deals.filter((d) => d.status === "DISPUTED").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Handshake className="w-5 h-5 text-indigo-400" />
        <h1 className="text-xl font-bold text-white">Mediated Deals</h1>
        {openCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-xs font-bold">
            {openCount} disputed
          </span>
        )}
      </div>

      {deals.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No admin-mediated or disputed deals.</p>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => {
            const buyer = userMap.get(d.buyerId);
            const seller = userMap.get(d.sellerId);
            const listing = listingMap.get(d.listingId);
            const brief = briefs.get(d.id);
            return (
              <div key={d.id} className="glass rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${
                    STATUS_STYLE[d.status] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30"
                  }`}
                >
                  {d.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{listing?.title ?? "—"}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {buyer?.name ?? buyer?.email ?? "buyer"} → {seller?.name ?? seller?.email ?? "seller"} ·{" "}
                    {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-white">{usd(toNum(d.amount))}</p>
                  {toNum(d.adminFee) > 0 && (
                    <p className="text-[10px] text-amber-300">fee {usd(toNum(d.adminFee))}</p>
                  )}
                </div>
                <Link
                  href={`/marketplace/messages/${d.threadId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
              {brief && (
                <details className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs">
                  <summary className="cursor-pointer text-slate-300">
                    Service order · <span className="font-bold text-white">{brief.tier.name}</span> ·{" "}
                    {usd(brief.tier.price)}
                    {brief.tier.deliveryDays ? ` · ${brief.tier.deliveryDays}d delivery` : ""} ·{" "}
                    {brief.tier.revisions} revision{brief.tier.revisions === 1 ? "" : "s"}
                    {brief.dueAt ? ` · due ${format(new Date(brief.dueAt), "d MMM yyyy")}` : ""}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {brief.tier.items.length > 0 && (
                      <p className="text-slate-400">Includes: {brief.tier.items.join(" · ")}</p>
                    )}
                    {brief.answers.length === 0 ? (
                      <p className="text-slate-500">No requirement answers.</p>
                    ) : (
                      brief.answers.map((a) => (
                        <div key={a.id}>
                          <p className="text-slate-500">{a.label}</p>
                          <p className="text-white whitespace-pre-wrap break-words">{a.value}</p>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
