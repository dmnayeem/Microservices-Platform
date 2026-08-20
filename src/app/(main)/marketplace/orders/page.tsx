import { usd } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { format } from "date-fns";
import { ShoppingBag, Download } from "lucide-react";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { SmartImage } from "@/components/user/primitives/smart-image";

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ordersRaw = await prisma.marketplacePurchase.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  const listingMap = new Map(
    (
      await prisma.marketplaceListing.findMany({
        where: { id: { in: ordersRaw.map((o) => o.listingId) } },
        select: { id: true, title: true, images: true, files: true },
      })
    ).map((l) => [l.id, l])
  );
  const orders = ordersRaw
    .map((o) => {
      const listing = listingMap.get(o.listingId);
      if (!listing) return null;
      return { ...o, listing };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">Order History</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Browse the marketplace to find something."
          action={{ label: "Browse Marketplace", href: "/marketplace" }}
        />
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="space-y-1.5">
            <Link
              href={`/marketplace/${o.listing.id}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-700"
            >
              {o.listing.images[0] ? (
                <SmartImage
                  src={o.listing.images[0]}
                  alt=""
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-lg bg-gray-800 object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-800" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {o.listing.title}
                </p>
                <p className="text-[11px] text-gray-500">
                  {format(o.createdAt, "MMM d, yyyy")} · {o.status}
                </p>
              </div>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {usd(o.amount)}
              </span>
            </Link>
            {o.status === "COMPLETED" && o.listing.files.length > 0 && (
              <a
                href={`/api/marketplace/listings/${o.listing.id}/download`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/40 text-xs font-bold hover:bg-indigo-500/25"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
