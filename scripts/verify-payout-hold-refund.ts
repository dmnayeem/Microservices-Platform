/**
 * A refund takes only what it owes out of a held payout.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-payout-hold-refund.ts
 *
 * Found in the 2026-09-26 audit: a dispute's partial refund cancelled the
 * seller's WHOLE held payout. On an $80 held share, a 50% refund took all $80 —
 * the buyer got $40 back, the seller got nothing, and the other $40 was paid to
 * nobody and recorded nowhere. This asserts the ceiling, against real rows.
 *
 * Creates a throwaway listing, purchase and payout, and removes them.
 */
import { prisma } from "./_q";
import { reverseHeldPayout } from "../src/lib/marketplace-payouts";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const [seller, buyer] = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!seller || !buyer) {
    console.log("Need two users.");
    process.exit(1);
  }

  const listing = await prisma.marketplaceListing.create({
    data: {
      title: "verify-payout-hold-refund — temporary",
      description: "Deleted at the end.",
      category: "OTHER",
      price: 100,
      status: "ACTIVE",
      sellerId: seller.id,
      images: [],
    },
    select: { id: true },
  });
  const made: string[] = [];

  const heldSale = async () => {
    const purchase = await prisma.marketplacePurchase.create({
      data: { listingId: listing.id, buyerId: buyer.id, amount: 100, fee: 20, sellerAmount: 80 },
      select: { id: true },
    });
    made.push(purchase.id);
    await prisma.marketplacePayout.create({
      data: {
        purchaseId: purchase.id,
        sellerId: seller.id,
        amount: 80,
        status: "HELD",
        releaseAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return purchase.id;
  };

  try {
    console.log("A partial refund takes only its share");
    const p1 = await heldSale();
    const took = await prisma.$transaction((tx) => reverseHeldPayout(tx, p1, "verify: 50% refund", 40));
    const row1 = await prisma.marketplacePayout.findUnique({ where: { purchaseId: p1 } });
    check("it reclaims exactly the $40 owed", took === 40, `${took}`);
    check("the held payout is NOT cancelled", row1?.status === "HELD", row1?.status);
    check("the seller's remaining $40 is still held for them", Number(row1?.amount) === 40, `${row1?.amount}`);

    console.log("\nA second partial refund takes from what is left, never more");
    const took2 = await prisma.$transaction((tx) => reverseHeldPayout(tx, p1, "verify: another refund", 100));
    const row1b = await prisma.marketplacePayout.findUnique({ where: { purchaseId: p1 } });
    check("capped at what is still held", took2 === 40, `${took2}`);
    check("which fully unwinds it", row1b?.status === "REVERSED", row1b?.status);

    console.log("\nA full refund reverses the whole share");
    const p2 = await heldSale();
    const full = await prisma.$transaction((tx) => reverseHeldPayout(tx, p2, "verify: full refund", 80));
    const row2 = await prisma.marketplacePayout.findUnique({ where: { purchaseId: p2 } });
    check("it reclaims all $80", full === 80, `${full}`);
    check("and marks it reversed", row2?.status === "REVERSED", row2?.status);

    console.log("\nNothing to take from a payout that was already released");
    await prisma.marketplacePayout.update({ where: { purchaseId: p2 }, data: { status: "RELEASED" } });
    const none = await prisma.$transaction((tx) => reverseHeldPayout(tx, p2, "verify", 80));
    check("a released payout gives back nothing — the caller claws from the balance", none === 0, `${none}`);
  } finally {
    await prisma.marketplacePayout.deleteMany({ where: { purchaseId: { in: made } } });
    await prisma.marketplacePurchase.deleteMany({ where: { id: { in: made } } });
    await prisma.marketplaceListing.delete({ where: { id: listing.id } }).catch(() => {});
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
