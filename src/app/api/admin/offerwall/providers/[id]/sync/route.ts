import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { parseOfferwallConfig, pointsFromUsd } from "@/lib/offerwall";
import { getOfferAdapter } from "@/lib/offerwall-providers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";

/**
 * POST /api/admin/offerwall/providers/[id]/sync — pull a provider's offer
 * catalog via its adapter and upsert OfferwallOffer rows (source=PROVIDER).
 * Body: { categoryId? } — target category; defaults to a per-provider category.
 * Requires the provider be API-type with an apiEndpoint (owner-configured).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const provider = await prisma.offerwallConfig.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provider not found" }, { status: 404 });

  const cfg = parseOfferwallConfig(provider.config);
  if (cfg.integrationType !== "API" || !cfg.apiEndpoint) {
    return NextResponse.json(
      { error: "This provider is not API-integrated (set integration = API + an offers endpoint)." },
      { status: 400 }
    );
  }

  const adapter = getOfferAdapter(provider.provider);
  const normalized = await adapter.fetchOffers({
    provider: provider.provider,
    apiKey: provider.apiKey,
    secretKey: provider.secretKey,
    config: { apiEndpoint: cfg.apiEndpoint, apiParams: cfg.apiParams, kind: cfg.kind },
  });

  if (normalized.length === 0) {
    return NextResponse.json({
      synced: 0,
      note: "No offers returned. Check the API endpoint/key, or the provider has no live offers.",
    });
  }

  // Resolve target category (body categoryId, else a per-provider category).
  const body = await request.json().catch(() => ({}));
  let categoryId: string | undefined = typeof body?.categoryId === "string" ? body.categoryId : undefined;
  if (categoryId) {
    const c = await prisma.offerwallCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) categoryId = undefined;
  }
  if (!categoryId) {
    const slug = slugify(provider.provider);
    const cat = await prisma.offerwallCategory.upsert({
      where: { slug },
      create: { name: adapter.label, slug, order: 100, isActive: true },
      update: {},
    });
    categoryId = cat.id;
  }

  const mult = cfg.rewardMultiplier || 1;
  let synced = 0;
  for (const o of normalized) {
    const points = o.payoutUsd
      ? Math.round((await pointsFromUsd(o.payoutUsd)) * mult)
      : Math.round((o.points ?? 0) * mult);
    // Upsert on (providerId, externalOfferId) — done via find + create/update
    // since there's no compound unique on the offer table.
    const existing = await prisma.offerwallOffer.findFirst({
      where: { providerId: id, externalOfferId: o.externalOfferId },
      select: { id: true },
    });
    const data = {
      categoryId: categoryId!,
      title: o.title,
      description: o.description ?? null,
      instructions: o.instructions,
      imageUrl: o.imageUrl ?? null,
      points,
      payoutUsd: o.payoutUsd ?? null,
      countries: o.countries,
      trackingUrlTemplate: o.trackingUrlTemplate ?? null,
      source: "PROVIDER" as const,
      providerId: id,
      externalOfferId: o.externalOfferId,
      completionMode: "POSTBACK" as const,
      proofScreenshot: false,
      holdHours: cfg.holdHours,
    };
    if (existing) {
      await prisma.offerwallOffer.update({ where: { id: existing.id }, data });
    } else {
      await prisma.offerwallOffer.create({ data });
    }
    synced++;
  }

  return NextResponse.json({ synced });
}
