import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SellerDashboardView } from "@/components/user/marketplace/seller-dashboard-view";
import { loadSellerDashboard } from "@/components/user/marketplace/seller-dashboard-data";

export default async function MyServicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { listings, pendingPayout, orders } = await loadSellerDashboard(session.user.id, "services");
  return (
    <SellerDashboardView listings={listings} pendingPayout={pendingPayout} orders={orders} mode="services" />
  );
}
