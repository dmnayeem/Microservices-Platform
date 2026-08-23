import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Gift, FileText } from "lucide-react";
import Link from "next/link";
import { OfferwallsClient } from "@/components/admin/offerwalls/offerwalls-client";
import { OfferwallCategoriesManager } from "@/components/admin/offerwalls/categories-manager";
import { OfferwallOffersManager } from "@/components/admin/offerwalls/offers-manager";
import { toNumOrNull } from "@/lib/money";

const TABS = [
  { id: "providers", label: "Providers" },
  { id: "categories", label: "Categories" },
  { id: "offers", label: "Offers" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function OfferwallsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "offerwalls.view"))) redirect("/admin");

  const canManage = await can(session.user.id, "offerwalls.manage");
  const sp = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === sp.tab)?.id ?? "providers") as TabId;

  const offerwallsRaw = await prisma.offerwallConfig.findMany({ orderBy: { provider: "asc" } });
  const offerwalls = offerwallsRaw.map((o) => ({
    id: o.id,
    provider: o.provider,
    apiKey: o.apiKey,
    secretKey: o.secretKey,
    callbackUrl: o.callbackUrl,
    isActive: o.isActive,
    config:
      o.config && typeof o.config === "object" && !Array.isArray(o.config)
        ? (o.config as Record<string, unknown>)
        : null,
  }));

  const [callbackCount, categoriesRaw, offersRaw] = await Promise.all([
    prisma.offerwallCallback.count(),
    prisma.offerwallCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { _count: { select: { offers: true } } },
    }),
    tab === "offers"
      ? prisma.offerwallOffer.findMany({
          orderBy: [{ categoryId: "asc" }, { order: "asc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
  ]);

  const categories = (
    categoriesRaw as unknown as Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      icon: string | null;
      color: string | null;
      order: number;
      isActive: boolean;
      _count: { offers: number };
    }>
  ).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon: c.icon,
    color: c.color,
    order: c.order,
    isActive: c.isActive,
    offerCount: c._count.offers,
  }));

  const offers = offersRaw.map((o) => ({
    ...o,
    payoutUsd: toNumOrNull(o.payoutUsd),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));

  const providerOptions = offerwalls.map((o) => ({ id: o.id, provider: o.provider }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-400" />
            Offerwall
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Integrate provider sites, organize offers into categories, and curate the offer catalog.
          </p>
        </div>
        <Link
          href="/admin/offerwall-callbacks"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          <FileText className="w-4 h-4" />
          Completions & Callbacks ({callbackCount})
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/offerwalls?tab=${t.id}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id
                ? "border-emerald-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
            {t.id === "categories" && ` (${categories.length})`}
          </Link>
        ))}
      </div>

      {tab === "providers" && (
        <OfferwallsClient
          initial={offerwalls}
          canManage={canManage}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
      {tab === "categories" && (
        <OfferwallCategoriesManager initial={categories} canManage={canManage} />
      )}
      {tab === "offers" && (
        <OfferwallOffersManager
          initialOffers={offers}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          providers={providerOptions}
          canManage={canManage}
        />
      )}
    </div>
  );
}
