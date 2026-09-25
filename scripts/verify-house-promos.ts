/**
 * Checks that promoting our own listings and courses actually puts an ad in a slot.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-house-promos.ts
 *
 * The thing worth asserting is that a promo is an ORDINARY house ad. If it were
 * anything else it would miss serving, frequency caps and the impression/click
 * counters, and the admin would be looking at a marketing screen that reports
 * nothing. So: the ad lands in the house campaign, it points at the item's own
 * page, it carries the item's picture and price, it sits under paid inventory
 * by weight, and unticking every slot really deletes it rather than leaving a
 * paused row behind.
 *
 * Creates nothing it does not delete.
 */
import { prisma } from "./_q";
import {
  promotableItems,
  setItemPromo,
  refreshPromos,
  promoTargetUrl,
} from "../src/lib/house-promos";
import { HOUSE_CAMPAIGN_TITLE } from "../src/lib/ad-demo";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

const SLOTS = ["MARKETPLACE_TOP", "DASHBOARD"];

async function main() {
  const seller = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  if (!seller) {
    console.log("No account to act as the seller.");
    process.exit(1);
  }

  // A throwaway listing, so the run never touches real stock.
  const listing = await prisma.marketplaceListing.create({
    data: {
      title: "verify-house-promos — temporary",
      description: "Created by verify-house-promos. Deleted at the end.",
      price: 12.5,
      status: "ACTIVE",
      sellerId: seller.id,
      category: "OTHER",
      images: ["https://example.com/verify-promo.png"],
    },
    select: { id: true },
  });
  const targetUrl = promoTargetUrl("LISTING", listing.id);

  try {
    console.log("Promoting into two slots");
    const a = await setItemPromo("LISTING", listing.id, SLOTS);
    check("two ads created", a.created === 2, JSON.stringify(a));

    const campaign = await prisma.adCampaign.findFirst({
      where: { title: HOUSE_CAMPAIGN_TITLE },
      select: { id: true, isHouse: true },
    });
    check("the house campaign is flagged isHouse", campaign?.isHouse === true);

    const ads = await prisma.ad.findMany({
      where: { campaignId: campaign!.id, targetUrl },
      select: { weight: true, contentUrl: true, headline: true, ctaLabel: true, status: true },
    });
    check("both ads are in the house campaign", ads.length === 2, `${ads.length}`);
    check("never billed — weight sits under paid inventory", ads.every((x) => x.weight === 7));
    check("the creative is the listing's own picture", ads.every((x) => x.contentUrl === "https://example.com/verify-promo.png"));
    check("the price is on the button", ads.every((x) => x.ctaLabel === "Buy — $12.50"), ads[0]?.ctaLabel ?? "");
    check("live", ads.every((x) => x.status === "ACTIVE"));

    console.log("\nThe admin screen sees it running");
    const items = await promotableItems();
    const row = items.find((i) => i.id === listing.id);
    check("the listing is listed as promotable", !!row);
    check("it reports both slots", (row?.placements.length ?? 0) === 2, `${row?.placements.length}`);

    console.log("\nDropping to one slot");
    const b = await setItemPromo("LISTING", listing.id, [SLOTS[0]]);
    check("one refreshed, one stopped", b.updated === 1 && b.removed === 1, JSON.stringify(b));

    console.log("\nA price change is picked up by refresh, not left stale");
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { price: 30 },
    });
    await refreshPromos();
    const after = await prisma.ad.findFirst({
      where: { campaignId: campaign!.id, targetUrl },
      select: { ctaLabel: true },
    });
    check("the ad now quotes the new price", after?.ctaLabel === "Buy — $30.00", after?.ctaLabel ?? "gone");

    console.log("\nA sold listing stops advertising itself");
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });
    await refreshPromos();
    const left = await prisma.ad.count({ where: { campaignId: campaign!.id, targetUrl } });
    check("no ad points at an unbuyable page", left === 0, `${left} left`);

    const gone = await promotableItems();
    check("and it drops off the promotable list", !gone.some((i) => i.id === listing.id));
  } finally {
    const campaign = await prisma.adCampaign.findFirst({
      where: { title: HOUSE_CAMPAIGN_TITLE },
      select: { id: true },
    });
    if (campaign) await prisma.ad.deleteMany({ where: { campaignId: campaign.id, targetUrl } });
    await prisma.marketplaceListing.delete({ where: { id: listing.id } }).catch(() => {});
    console.log("\ntest listing removed");
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
