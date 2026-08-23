import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEffectiveFeatures } from "@/lib/packages";
import { FeatureLock } from "@/components/user/primitives/feature-lock";
import { GamesCatalog } from "@/components/user/games/games-catalog";

export default async function GamesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { enabled } = await getEffectiveFeatures(session.user.id);
  if (!enabled.has("games")) return <FeatureLock title="HTML5 Games" />;

  const games = await prisma.game.findMany({
    where: { isActive: true },
    // Featured first, then the admin's order.
    orderBy: [{ isFeatured: "desc" }, { order: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      category: true,
      categoryId: true,
      description: true,
      iconUrl: true,
      coverUrl: true,
      isFeatured: true,
      embedUrl: true,
      playsCount: true,
      adPlacement: true,
      rewardEnabled: true,
      rewardPointsPerTick: true,
      rewardTickSeconds: true,
    },
  });

  // Category names are fetched separately rather than through a nested relation
  // select: the Accelerate client extension loses the inferred shape of nested
  // selects, which is why other pages here carry hand-written type assertions.
  // Two flat queries keep the types honest and cost less than one bad cast.
  const categoryIds = [
    ...new Set(games.map((g) => g.categoryId).filter(Boolean) as string[]),
  ];
  const categories = categoryIds.length
    ? await prisma.gameCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <GamesCatalog
      games={games.map((g) => ({
        ...g,
        // The taxonomy name when the game has been categorised, falling back to
        // the legacy free-text column for rows the backfill didn't match.
        categoryName: g.categoryId ? nameById.get(g.categoryId) ?? null : null,
      }))}
    />
  );
}
