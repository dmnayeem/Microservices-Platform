import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { BrandsClient, type BrandRow } from "./_components/BrandsClient";

export const dynamic = "force-dynamic";

export default async function MarketplaceBrandsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "marketplace.manage"))) redirect("/admin/marketplace");

  const brands = await prisma.marketplaceBrand.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const counts = await Promise.all(
    brands.map((b) => prisma.marketplaceListing.count({ where: { brandId: b.id } }))
  );

  const rows: BrandRow[] = brands.map((b, i) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    logo: b.logo,
    bio: b.bio,
    website: b.website,
    isActive: b.isActive,
    listingCount: counts[i],
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/marketplace" className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Store className="w-6 h-6 text-indigo-400" />
            Storefronts
          </h1>
          <p className="text-gray-400 text-sm">
            Names your listings are sold under. A listing still belongs to your admin
            account — this only changes whose name the buyer sees.
          </p>
        </div>
      </div>

      <BrandsClient initial={rows} />
    </div>
  );
}
