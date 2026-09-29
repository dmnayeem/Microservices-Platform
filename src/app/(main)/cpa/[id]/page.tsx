import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getHiddenPaths } from "@/lib/page-visibility-server";
import { getPointsPerUsd } from "@/lib/economy";
import { CpaOfferDetail } from "@/components/user/cpa/cpa-offer-detail";

export const metadata = { title: "CPA Offer" };

export default async function CpaOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [{ id }, sp, hidden, pointsPerUsd] = await Promise.all([
    params,
    searchParams,
    getHiddenPaths(session.user.id),
    getPointsPerUsd(),
  ]);
  if (hidden.includes("/cpa")) redirect("/no-access");
  const error = typeof sp.error === "string" && /^[A-Z_]{2,32}$/.test(sp.error) ? sp.error : null;
  return <CpaOfferDetail id={id} pointsPerUsd={pointsPerUsd} errorCode={error} />;
}
