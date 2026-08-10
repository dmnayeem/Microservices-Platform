import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { CREATOR_TYPES, CREATOR_TYPE_VALUES } from "@/lib/creator-application";
import type { CreatorApplicationType } from "@/generated/prisma";
import { BecomeCreatorView, type RoleCard } from "./_components/BecomeCreatorView";

export const metadata = { title: "Become a Creator" };

export default async function BecomeCreatorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [features, user, apps, tutorApp] = await Promise.all([
    getEffectiveFeatures(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, affiliateJoinedAt: true },
    }),
    prisma.creatorApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tutorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, adminNote: true },
    }),
  ]);

  // Latest application per generic type.
  const latestByType = new Map<CreatorApplicationType, (typeof apps)[number]>();
  for (const a of apps) if (!latestByType.has(a.type)) latestByType.set(a.type, a);

  const cards: RoleCard[] = [];

  // Tutor — dedicated flow.
  const isTutor = user?.role === "TUTOR";
  cards.push({
    key: "TUTOR",
    label: "Tutor — Sell Courses",
    blurb: "Create and sell courses; earn from every enrollment.",
    dashboardHref: "/tutor/dashboard",
    applyHref: "/profile/become-tutor",
    status: isTutor
      ? "has_access"
      : tutorApp?.status === "PENDING"
        ? "pending"
        : tutorApp?.status === "REJECTED"
          ? "rejected"
          : "apply",
    adminNote: tutorApp?.status === "REJECTED" ? tutorApp.adminNote : null,
  });

  // The four generic types.
  for (const type of CREATOR_TYPE_VALUES) {
    const meta = CREATOR_TYPES[type];
    const hasAccess =
      type === "AFFILIATE"
        ? !!user?.affiliateJoinedAt
        : meta.gateFeature
          ? features.enabled.has(meta.gateFeature)
          : false;
    const latest = latestByType.get(type);
    cards.push({
      key: type,
      label: meta.label,
      blurb: meta.blurb,
      dashboardHref: meta.dashboardHref,
      applyType: type,
      status: hasAccess
        ? "has_access"
        : latest?.status === "PENDING"
          ? "pending"
          : latest?.status === "REJECTED"
            ? "rejected"
            : "apply",
      adminNote: latest?.status === "REJECTED" ? latest.adminNote : null,
    });
  }

  return <BecomeCreatorView cards={cards} />;
}
