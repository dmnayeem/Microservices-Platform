import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SellerDashboardView } from "@/components/user/marketplace/seller-dashboard-view";
import { loadSellerDashboard } from "@/components/user/marketplace/seller-dashboard-data";

export default async function MyListingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { listings, pendingPayout } = await loadSellerDashboard(session.user.id, "products");
  return <SellerDashboardView listings={listings} pendingPayout={pendingPayout} />;
}
