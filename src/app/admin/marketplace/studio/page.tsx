import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Sparkles, Store } from "lucide-react";
import { CATEGORIES } from "@/lib/marketplace-categories";
import { STUDIO_IMAGE_MODELS, STUDIO_VIDEO_MODELS } from "@/lib/marketplace-studio";
import { isMagnificConfigured } from "@/lib/magnific";
import { isGeminiConfigured } from "@/lib/gemini";
import { StudioClient } from "./_components/StudioClient";

export const dynamic = "force-dynamic";

export default async function StockStudioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "marketplace.manage"))) redirect("/admin/marketplace");

  const [brands, magnificReady, geminiReady] = await Promise.all([
    prisma.marketplaceBrand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    isMagnificConfigured(),
    isGeminiConfigured(),
  ]);

  const categories = CATEGORIES.map((c) => ({
    assetType: c.assetType as string,
    label: c.label,
    deliverableKind: c.deliverableKind ?? null,
    subTypes: (c.subTypes ?? []).map((s) => ({ slug: s.slug, label: s.label })),
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/marketplace" className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            Stock Studio
          </h1>
          <p className="text-gray-400 text-sm">
            Generate, import or upload an asset, let AI write the listing, set your price,
            and publish it to the marketplace.
          </p>
        </div>
        <Link
          href="/admin/marketplace/brands"
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm shrink-0"
        >
          <Store className="w-4 h-4" />
          Storefronts
        </Link>
      </div>

      <StudioClient
        brands={brands}
        categories={categories}
        models={STUDIO_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
        videoModels={STUDIO_VIDEO_MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
        magnificReady={magnificReady}
        geminiReady={geminiReady}
      />
    </div>
  );
}
