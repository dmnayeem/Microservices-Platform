import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { CreateListingView } from "@/components/user/marketplace/create-listing-view";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { ProfileGate } from "@/components/user/profile/profile-gate";
import { getProfileGateState } from "@/lib/profile-gate-server";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { isServiceType } from "@/lib/marketplace-categories";

/** Offer a service, or — with `?edit=<id>` — edit one of your own services. */
export default async function CreateServicePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const gate = await getProfileGateState(session.user.id!, "selling");
  if (gate.locked) return <ProfileGate progress={gate.progress} surface="offering services" />;

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("sellServices"))
    return <FeatureLock title="Offer Services" applyHref="/apply?type=SERVICE_PROVIDER" />;

  const editId = (await searchParams).edit;
  if (editId) {
    const l = await prisma.marketplaceListing.findUnique({
      where: { id: editId },
      select: {
        id: true,
        sellerId: true,
        assetType: true,
        title: true,
        description: true,
        subType: true,
        price: true,
        details: true,
        images: true,
      },
    });
    if (!l || l.sellerId !== session.user.id || !isServiceType(l.assetType)) notFound();
    return (
      <CreateListingView
        mode="services"
        initial={{
          id: l.id,
          title: l.title,
          description: l.description,
          subType: l.subType,
          price: toNum(l.price),
          details:
            l.details && typeof l.details === "object" && !Array.isArray(l.details)
              ? (l.details as Record<string, unknown>)
              : null,
          images: l.images,
        }}
      />
    );
  }

  return <CreateListingView mode="services" />;
}
