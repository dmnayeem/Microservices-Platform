import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { toNum } from "@/lib/money";
import type { Prisma } from "@/generated/prisma";

type InboxThread = {
  id: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt: Date;
  unreadBuyer: number;
  unreadSeller: number;
  listing: { id: string; title: string; images: string[] };
  messages: { body: string }[];
  deals: { id: string; status: string; amount: Prisma.Decimal }[];
};

const TERMINAL = ["RELEASED", "REFUNDED", "CANCELLED"];
const STATUS_STYLE: Record<string, string> = {
  PROPOSED: "bg-amber-500/15 text-amber-300",
  FUNDED: "bg-indigo-500/15 text-indigo-300",
  DELIVERED: "bg-blue-500/15 text-blue-300",
  DISPUTED: "bg-red-500/15 text-red-300",
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const threads = (await prisma.marketplaceThread.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      listing: { select: { id: true, title: true, images: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      deals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })) as unknown as InboxThread[];

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">Messages</h1>
      {threads.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Open a listing and tap “Message seller” to start a deal."
        />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const iAmBuyer = t.buyerId === userId;
            const unread = iAmBuyer ? t.unreadBuyer : t.unreadSeller;
            const deal = t.deals[0];
            const activeDeal = deal && !TERMINAL.includes(deal.status) ? deal : null;
            return (
              <Link
                key={t.id}
                href={`/marketplace/messages/${t.id}`}
                className="glass rounded-xl p-3 flex items-center gap-3 hover:bg-white/5"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-900 shrink-0">
                  {t.listing.images?.[0] ? (
                    <SmartImage src={t.listing.images[0]} alt="" fill sizes="48px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{t.listing.title}</p>
                    <span className="text-[10px] uppercase tracking-wider text-gray-500">
                      {iAmBuyer ? "Buying" : "Selling"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {t.messages[0]?.body ?? "No messages yet"}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-[10px] text-gray-500">
                    {formatDistanceToNow(t.lastMessageAt, { addSuffix: true })}
                  </p>
                  {activeDeal && (
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        STATUS_STYLE[activeDeal.status] ?? "bg-slate-500/15 text-slate-300"
                      }`}
                    >
                      ${toNum(activeDeal.amount).toFixed(0)} · {activeDeal.status}
                    </span>
                  )}
                  {unread > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                      {unread}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
