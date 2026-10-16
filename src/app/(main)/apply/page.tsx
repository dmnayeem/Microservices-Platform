import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { CREATOR_TYPES, CREATOR_TYPE_VALUES } from "@/lib/creator-application";
import { getBadgeState } from "@/lib/badges-server";
import { evaluateAllPrograms } from "@/lib/application-requirements-server";
import { PROGRAMS, PROGRAM_KEYS, isProgramKey, type ProgramKey } from "@/lib/application-requirements";
import type { CreatorApplicationType } from "@/generated/prisma";
import { ApplyHubView, type HubCard, type HubStatus } from "./_components/apply-hub-view";

export const metadata = { title: "Apply — Programs & Access" };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const focus = isProgramKey(sp.type) ? sp.type : null;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(focus ? `/apply?type=${focus}` : "/apply")}`);
  }
  const userId = session.user.id;

  const [features, user, creatorApps, tutorApp, ambassadorApp, badge, evals] = await Promise.all([
    getEffectiveFeatures(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, affiliateJoinedAt: true } }),
    prisma.creatorApplication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { type: true, status: true, adminNote: true, createdAt: true },
      take: 60,
    }),
    prisma.tutorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, adminNote: true, createdAt: true },
    }),
    prisma.ambassadorApplication.findUnique({
      where: { userId },
      select: { status: true, adminNote: true, createdAt: true },
    }),
    getBadgeState(userId),
    evaluateAllPrograms(userId),
  ]);

  const latestByType = new Map<CreatorApplicationType, (typeof creatorApps)[number]>();
  for (const a of creatorApps) if (!latestByType.has(a.type)) latestByType.set(a.type, a);

  const fromStatus = (s: string | undefined | null): HubStatus =>
    s === "PENDING" ? "pending" : s === "REJECTED" ? "rejected" : s === "APPROVED" ? "active" : "none";

  const statusOf: Record<ProgramKey, { status: HubStatus; adminNote: string | null; appliedAt: string | null }> =
    {} as never;

  for (const type of CREATOR_TYPE_VALUES) {
    const meta = CREATOR_TYPES[type];
    const hasAccess =
      type === "AFFILIATE"
        ? !!user?.affiliateJoinedAt
        : meta.gateFeature
          ? features.enabled.has(meta.gateFeature)
          : false;
    const latest = latestByType.get(type);
    // An approved application whose access was later revoked reads as "none":
    // the member has to apply again.
    const st = hasAccess ? "active" : latest?.status === "APPROVED" ? "none" : fromStatus(latest?.status);
    statusOf[type] = {
      status: st,
      adminNote: latest?.adminNote ?? null,
      appliedAt: latest?.createdAt.toISOString() ?? null,
    };
  }

  const isTutor = user?.role === "TUTOR";
  statusOf.TUTOR = {
    status: isTutor ? "active" : tutorApp?.status === "APPROVED" ? "none" : fromStatus(tutorApp?.status),
    adminNote: tutorApp?.adminNote ?? null,
    appliedAt: tutorApp?.createdAt.toISOString() ?? null,
  };
  statusOf.AMBASSADOR = {
    status: fromStatus(ambassadorApp?.status),
    adminNote: ambassadorApp?.adminNote ?? null,
    appliedAt: ambassadorApp?.createdAt.toISOString() ?? null,
  };
  statusOf.BLUE_BADGE = {
    status: badge?.active ? "active" : "none",
    adminNote: null,
    appliedAt: null,
  };

  const cards: HubCard[] = PROGRAM_KEYS.map((key) => {
    const meta = PROGRAMS[key];
    const ev = evals[key];
    return {
      key,
      label: meta.label,
      blurb: meta.blurb,
      benefits: meta.benefits,
      icon: meta.icon,
      flowHref: meta.flowHref,
      dashboardHref: meta.dashboardHref,
      note: ev.requirements.note,
      enabled: ev.requirements.enabled,
      checks: ev.checks.filter((c) => c.key !== "enabled"),
      eligible: ev.ok,
      ...statusOf[key],
      // Tutors apply from a USER role only; staff see why instead of a form that refuses them.
      blockedReason:
        key === "TUTOR" && user && user.role !== "USER" && user.role !== "TUTOR"
          ? `Your account role (${user.role}) can't apply to be a tutor.`
          : null,
    };
  });

  return <ApplyHubView cards={cards} focus={focus} />;
}
