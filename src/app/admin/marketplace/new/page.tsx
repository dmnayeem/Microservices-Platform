import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreateListingForm } from "@/components/admin/marketplace/create-listing-form";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";

export default async function NewMarketplaceListingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(await can(session.user.id, "marketplace.manage"))) redirect("/admin/marketplace");

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/marketplace"
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            Create Listing
          </h1>
          <p className="text-gray-400 text-sm">
            Add a new item to the marketplace.
          </p>
        </div>
      </div>

      <CreateListingForm />
    </div>
  );
}
