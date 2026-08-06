import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import {
  getOfferChainState,
  offerAllowsCountry,
  parseOfferwallConfig,
} from "@/lib/offerwall";

// GET /api/offerwall/catalog — the user's offer catalog: active categories +
// their country-eligible offers, each tagged locked / available / done, plus
// the active embedded provider walls for the "Featured walls" row.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  if (!(await userCanFeature(userId, "offerwallTasks"))) {
    return NextResponse.json({ error: "Offerwall isn't enabled for your account.", locked: true }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
  const country = user?.country ?? null;

  const [categories, offers, completions, chain, providers] = await Promise.all([
    prisma.offerwallCategory.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.offerwallOffer.findMany({
      where: { isActive: true, category: { isActive: true } },
      orderBy: [{ categoryId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.offerwallCompletion.findMany({
      where: { userId },
      select: { offerId: true, status: true },
    }),
    getOfferChainState(userId),
    prisma.offerwallConfig.findMany({ where: { isActive: true } }),
  ]);

  const statusByOffer = new Map(
    (completions as Array<{ offerId: string; status: string }>).map((c) => [c.offerId, c.status])
  );

  const visibleOffers = (offers as Array<Record<string, unknown>>)
    .filter((o) => offerAllowsCountry(o.countries as string[], country))
    .map((o) => {
      const id = o.id as string;
      const st = statusByOffer.get(id);
      const done = st === "APPROVED";
      const pending = st === "PENDING" || st === "STARTED";
      return {
        id,
        categoryId: o.categoryId as string,
        title: o.title as string,
        description: o.description as string | null,
        imageUrl: o.imageUrl as string | null,
        points: o.points as number,
        instructions: o.instructions as string[],
        completionMode: o.completionMode as string,
        featured: o.featured as boolean,
        locked: chain.lockedOfferIds.has(id) && !done && !pending,
        done,
        pending,
      };
    });

  // Embedded provider walls (IFRAME) for the featured section. Surveys (e.g.
  // CPX Research) need a per-user secure_hash = md5(userId + secret) injected
  // into the wall URL — computed server-side so the secret never leaves.
  const walls = (providers as Array<Record<string, unknown>>)
    .map((p) => {
      const cfg = parseOfferwallConfig(p.config);
      if (cfg.integrationType !== "IFRAME" || !cfg.iframeUrl) return null;
      const secret = (p.secretKey as string | null) ?? "";
      const secureHash = secret
        ? crypto.createHash("md5").update(userId + secret).digest("hex")
        : "";
      const url = cfg.iframeUrl
        .replace(/\{userId\}/gi, encodeURIComponent(userId))
        .replace(/\{secureHash\}/gi, secureHash)
        .replace(/\{secure_hash\}/gi, secureHash);
      return { id: p.id as string, provider: p.provider as string, kind: cfg.kind, url };
    })
    .filter(Boolean);

  return NextResponse.json({
    country,
    categories: (categories as Array<Record<string, unknown>>).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
    })),
    offers: visibleOffers,
    walls,
  });
}
