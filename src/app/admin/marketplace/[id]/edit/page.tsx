import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { toNum, toNumOrNull } from "@/lib/money";
import { notFound, redirect } from "next/navigation";
import { EditListingForm } from "./_components/EditListingForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditListingPage({ params }: PageProps) {
  const session = await auth();
  const { id } = await params;

  if (!session?.user) {
    redirect("/login");
  }

  const adminRole = session.user.role as UserRole | undefined;
  const canManage = hasPermission(adminRole, "marketplace.manage");

  if (!canManage) {
    redirect("/admin/marketplace");
  }

  // Fetch the listing
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
    },
  });

  if (!listing) {
    notFound();
  }

  // Decimal money columns → plain numbers for the client form.
  const listingForForm = {
    ...listing,
    price: toNum(listing.price),
    monthlyRevenue: toNumOrNull(listing.monthlyRevenue),
    monthlyProfit: toNumOrNull(listing.monthlyProfit),
    monthlyExpenses: toNumOrNull(listing.monthlyExpenses),
    startingBid: toNumOrNull(listing.startingBid),
    reservePrice: toNumOrNull(listing.reservePrice),
    buyNowPrice: toNumOrNull(listing.buyNowPrice),
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-gray-900 to-black p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Edit Listing</h1>
          <p className="text-gray-400">Update the marketplace listing details</p>
        </div>

        <EditListingForm listing={listingForForm} />
      </div>
    </div>
  );
}
