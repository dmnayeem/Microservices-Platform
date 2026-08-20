/**
 * Seed one labeled demo ad for every ad placement so the whole ad-space
 * network is visibly populated (feed sidebar, in-feed native, global top/bottom
 * banners, and every per-page slot). Idempotent — safe to re-run.
 *
 * Run:  npx tsx prisma/seed-demo-ads.ts
 * Undo: remove the "DEMO — Ad Previews" campaign in the admin Ad Manager, or
 *       call removeDemoAds().
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateDemoAds } from "../src/lib/ad-demo";

// Connect with the matching option for the DATABASE_URL scheme: Accelerate proxy
// (prisma://) vs a direct postgres:// connection via the pg driver adapter.
const seedUrl = process.env.DATABASE_URL!;
const prisma =
  seedUrl.startsWith("prisma://") || seedUrl.startsWith("prisma+postgres://")
    ? new PrismaClient({ accelerateUrl: seedUrl })
    : new PrismaClient({ adapter: new PrismaPg({ connectionString: seedUrl }) });

generateDemoAds(prisma)
  .then((r) => {
    console.log(`Demo ads: created ${r.created} of ${r.total} placements.`);
  })
  .catch((e) => {
    console.error("Demo-ad seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
