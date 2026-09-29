import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { getPointsPerUsd } from "@/lib/economy";
import { CpaOffersView } from "@/components/user/cpa/cpa-offers-view";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";

export const metadata = { title: "CPA Offers" };

// The (main) layout's PageAccessGuard already bounces a hidden page on the
// client; checking here as well means a hidden /cpa never renders at all.
export default async function CpaOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [hidden, pointsPerUsd, sp] = await Promise.all([
    getHiddenPaths(session.user.id),
    getPointsPerUsd(),
    searchParams,
  ]);
  if (hidden.includes("/cpa")) redirect("/no-access");
  // Same gate as /offerwalls ("cpa", also locked by "tasks"). Enforced again
  // server-side by /go/cpa and the submit route.
  const gate = await getProfileGateState(session.user.id, "cpa");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="CPA offers" />;
  return <CpaOffersView pointsPerUsd={pointsPerUsd} initialTab={sp.tab === "mine" ? "mine" : "available"} />;
}
