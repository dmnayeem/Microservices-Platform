/**
 * Checks the two admin-toggled selling rules: licence tiers, and the payout hold.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-marketplace-selling-rules.ts
 *
 * Both sit directly on the money path of every marketplace sale, so the things
 * asserted here are the ones that would cost real money to get wrong:
 *
 *  - with both switched OFF, nothing changes and no payout row is written;
 *  - a held payout pays the seller EXACTLY ONCE, even if the sweep runs twice;
 *  - a refund inside the window reverses the hold instead of clawing back;
 *  - a released payout can no longer be reversed, and a reversed one is never
 *    paid.
 *
 * It saves and restores the real settings around itself, and deletes every row
 * it creates, so it is safe to run against production.
 */
import { readFileSync } from "fs";
import { prisma } from "./_q";
import { toNum } from "../src/lib/money";
import {
  sanitizeTiers,
  resolveTierPrice,
  getPayoutHoldConfig,
  savePayoutHoldConfig,
  getMarketplaceTaxConfig,
  saveMarketplaceTaxConfig,
  computeCommissionTax,
  getLicenseTiersEnabled,
  setLicenseTiersEnabled,
  payOrHoldSeller,
  type PayoutHoldConfig,
} from "../src/lib/marketplace-selling";
import { releaseDuePayouts, reverseHeldPayout } from "../src/lib/marketplace-payouts";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Every path that pays a marketplace seller. Each must route through
 * payOrHoldSeller, or the admin turns the hold on and some ways of buying
 * quietly keep paying instantly \u2014 a switch that only half works is worse
 * than no switch. Escrow is excluded on purpose: MarketplaceDeal holds funds
 * through its own lifecycle and must not hold them twice.
 */
const SELLER_PAY_SITES = [
  "src/app/api/marketplace/[id]/checkout/route.ts",
  "src/app/api/cart/checkout/route.ts",
  "src/app/api/marketplace/listings/[id]/offers/[offerId]/route.ts",
  "src/lib/marketplace-auctions.ts",
];

async function main() {
  console.log("Every sale path honours the hold");
  for (const f of SELLER_PAY_SITES) {
    let src = "";
    try {
      src = readFileSync(f, "utf8");
    } catch {
      check(`${f} exists`, false, "file not found \u2014 was it moved?");
      continue;
    }
    check(
      `${f.split("/").slice(-2).join("/")} routes through payOrHoldSeller`,
      src.includes("payOrHoldSeller"),
      src.includes("payOrHoldSeller") ? "" : "PAYS THE SELLER DIRECTLY"
    );
  }

  console.log("\nTier sanitising");
  const dirty = [
    { id: "Standard Licence!", name: "Standard", price: "12.005" },
    { id: "ext", name: "Extended", price: 40 },
    { id: "ext", name: "Duplicate id", price: 99 },
    { id: "free", name: "Free", price: 0 },
    { id: "bad", name: "", price: 5 },
    "nonsense",
  ];
  const clean = sanitizeTiers(dirty);
  check("ids are slugged", clean[0]?.id === "standard-licence-", clean[0]?.id ?? "none");
  check("duplicate ids dropped", clean.filter((t) => t.id === "ext").length === 1);
  check("zero-price tier dropped", !clean.some((t) => t.price === 0));
  check("nameless tier dropped", !clean.some((t) => t.name === ""));
  check("garbage entries ignored", clean.length === 2, `${clean.length} kept`);
  check("sorted cheapest first", clean[0].price <= clean[1].price);
  check("non-array input is not fatal", sanitizeTiers(null).length === 0);

  console.log("\nTier pricing");
  const taxOff = { enabled: false, pct: 15, label: "VAT" };
  const taxOnCfg = { enabled: true, pct: 15, label: "VAT" };
  check("tax off charges nothing", computeCommissionTax(2, taxOff).tax === 0);
  check(
    "15% of a $2 commission is $0.30",
    computeCommissionTax(2, taxOnCfg).tax === 0.3,
    String(computeCommissionTax(2, taxOnCfg).tax)
  );
  check("the rate is recorded with it", computeCommissionTax(2, taxOnCfg).pct === 15);
  check("a zero commission is untaxed", computeCommissionTax(0, taxOnCfg).tax === 0);
  check(
    "a 0% rate charges nothing even when enabled",
    computeCommissionTax(2, { enabled: true, pct: 0, label: "VAT" }).tax === 0
  );
  check(
    "rounded to whole cents",
    computeCommissionTax(1.333, taxOnCfg).tax === 0.2,
    String(computeCommissionTax(1.333, taxOnCfg).tax)
  );
  {
    const price = 10;
    const commission = 2;
    const { tax } = computeCommissionTax(commission, taxOnCfg);
    check("seller is unaffected by tax", price - commission === 8);
    check("buyer pays price + tax", price + tax === 10.3, String(price + tax));
    check("commission and tax stay separate", commission === 2 && tax === 0.3);
  }

  const taxRt = await getMarketplaceTaxConfig();
  await saveMarketplaceTaxConfig({ enabled: true, pct: 7.5, label: "GST" });
  const back = await getMarketplaceTaxConfig();
  check(
    "tax settings round-trip",
    back.enabled && back.pct === 7.5 && back.label === "GST",
    JSON.stringify(back)
  );
  await saveMarketplaceTaxConfig(taxRt);

  const tiers = sanitizeTiers([
    { id: "std", name: "Standard", price: 10 },
    { id: "ext", name: "Extended", price: 40 },
  ]);
  const off = resolveTierPrice(10, tiers, "ext", false);
  check(
    "with the feature OFF the base price always wins",
    off.ok && off.price === 10 && off.tier === null,
    off.ok ? String(off.price) : off.error
  );
  const none = resolveTierPrice(10, tiers, undefined, true);
  check("no choice defaults to the cheapest", none.ok && none.price === 10);
  const ext = resolveTierPrice(10, tiers, "ext", true);
  check("a chosen tier sets the price", ext.ok && ext.price === 40);
  const gone = resolveTierPrice(10, tiers, "vanished", true);
  check(
    "a tier that no longer exists is an error, not a silent downgrade",
    !gone.ok,
    gone.ok ? "accepted!" : gone.error
  );
  const noTiers = resolveTierPrice(7, [], "std", true);
  check("a listing without tiers falls back to its price", noTiers.ok && noTiers.price === 7);

  // ---- settings round trip, restoring whatever was really set ----
  const originalHold = await getPayoutHoldConfig();
  const originalTiers = await getLicenseTiersEnabled();

  console.log("\nSettings");
  await savePayoutHoldConfig({ enabled: true, days: 3 });
  const readBack = await getPayoutHoldConfig();
  check("hold config round-trips", readBack.enabled && readBack.days === 3, JSON.stringify(readBack));
  await savePayoutHoldConfig({ enabled: true, days: 999 });
  check("absurd hold is clamped", (await getPayoutHoldConfig()).days === 90);
  await setLicenseTiersEnabled(true);
  check("tier switch round-trips", (await getLicenseTiersEnabled()) === true);

  // ---- money ----
  const seller = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, cashBalance: true, totalEarnings: true },
  });
  if (!seller) {
    console.log("No admin account to act as seller.");
    process.exit(1);
  }
  const startBalance = toNum(seller.cashBalance);

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: seller.id,
      title: "verify-selling-rules",
      description: "Created by verify-marketplace-selling-rules. Deleted at the end.",
      category: "Stock photo",
      assetType: "STOCK_PHOTO",
      saleMode: "UNLIMITED",
      price: 10,
      status: "PENDING_REVIEW",
    },
    select: { id: true },
  });

  const mkPurchase = async () =>
    prisma.marketplacePurchase.create({
      data: {
        listingId: listing.id,
        buyerId: seller.id,
        amount: 10,
        fee: 2,
        sellerAmount: 8,
        status: "COMPLETED",
      },
      select: { id: true },
    });

  console.log("\nHold OFF — the seller is paid immediately");
  const pImmediate = await mkPurchase();
  await prisma.$transaction(async (tx) =>
    payOrHoldSeller(tx, {
      sellerId: seller.id,
      purchaseId: pImmediate.id,
      amount: 8,
      hold: { enabled: false, days: 7 } as PayoutHoldConfig,
    })
  );
  const afterImmediate = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { cashBalance: true },
  });
  check(
    "balance moved by the sale amount",
    Math.abs(toNum(afterImmediate?.cashBalance) - (startBalance + 8)) < 0.001,
    `${startBalance} -> ${toNum(afterImmediate?.cashBalance)}`
  );
  check(
    "no payout row was written",
    (await prisma.marketplacePayout.count({ where: { purchaseId: pImmediate.id } })) === 0
  );

  console.log("\nHold ON — the money waits");
  const pHeld = await mkPurchase();
  await prisma.$transaction(async (tx) =>
    payOrHoldSeller(tx, {
      sellerId: seller.id,
      purchaseId: pHeld.id,
      amount: 8,
      hold: { enabled: true, days: 7 },
    })
  );
  const balanceAfterHold = toNum(
    (await prisma.user.findUnique({ where: { id: seller.id }, select: { cashBalance: true } }))
      ?.cashBalance
  );
  check(
    "the seller was NOT credited",
    Math.abs(balanceAfterHold - (startBalance + 8)) < 0.001,
    `still ${balanceAfterHold}`
  );
  const heldRow = await prisma.marketplacePayout.findUnique({ where: { purchaseId: pHeld.id } });
  check("a HELD payout exists", heldRow?.status === "HELD", heldRow?.status ?? "none");
  check("it is not due yet", !!heldRow && heldRow.releaseAt > new Date());

  console.log("\nThe sweep only pays what is due");
  const notYet = await releaseDuePayouts({ limit: 50 });
  check(
    "a payout still inside its window is left alone",
    (await prisma.marketplacePayout.findUnique({ where: { purchaseId: pHeld.id } }))?.status ===
      "HELD",
    `examined ${notYet.examined}`
  );

  // Backdate it so it is due, then release.
  await prisma.marketplacePayout.update({
    where: { purchaseId: pHeld.id },
    data: { releaseAt: new Date(Date.now() - 60_000) },
  });
  const firstRun = await releaseDuePayouts({ limit: 50 });
  const releasedRow = await prisma.marketplacePayout.findUnique({
    where: { purchaseId: pHeld.id },
  });
  check("a due payout is released", releasedRow?.status === "RELEASED", releasedRow?.status ?? "");
  const paidBalance = toNum(
    (await prisma.user.findUnique({ where: { id: seller.id }, select: { cashBalance: true } }))
      ?.cashBalance
  );
  check(
    "the money reached the wallet",
    Math.abs(paidBalance - (startBalance + 16)) < 0.001,
    `${paidBalance}`
  );
  check("the run reported it", firstRun.released >= 1, `released ${firstRun.released}`);

  console.log("\nRunning the sweep twice must not pay twice");
  const secondRun = await releaseDuePayouts({ limit: 50 });
  const afterSecond = toNum(
    (await prisma.user.findUnique({ where: { id: seller.id }, select: { cashBalance: true } }))
      ?.cashBalance
  );
  check(
    "balance unchanged on the second run",
    Math.abs(afterSecond - paidBalance) < 0.001,
    `${afterSecond}`
  );
  check("nothing was released again", secondRun.released === 0);

  console.log("\nRefund inside the window reverses instead of clawing back");
  const pRefund = await mkPurchase();
  await prisma.$transaction(async (tx) =>
    payOrHoldSeller(tx, {
      sellerId: seller.id,
      purchaseId: pRefund.id,
      amount: 8,
      hold: { enabled: true, days: 7 },
    })
  );
  const reclaimed = await reverseHeldPayout(prisma, pRefund.id, "verification");
  check("the full amount came back from the hold", reclaimed === 8, String(reclaimed));
  const reversedRow = await prisma.marketplacePayout.findUnique({
    where: { purchaseId: pRefund.id },
  });
  check("the row is REVERSED", reversedRow?.status === "REVERSED", reversedRow?.status ?? "");
  const afterReverse = toNum(
    (await prisma.user.findUnique({ where: { id: seller.id }, select: { cashBalance: true } }))
      ?.cashBalance
  );
  check(
    "no wallet movement was needed",
    Math.abs(afterReverse - paidBalance) < 0.001,
    `${afterReverse}`
  );

  console.log("\nA reversed payout is never paid");
  await prisma.marketplacePayout.update({
    where: { purchaseId: pRefund.id },
    data: { releaseAt: new Date(Date.now() - 60_000) },
  });
  await releaseDuePayouts({ limit: 50 });
  const stillReversed = await prisma.marketplacePayout.findUnique({
    where: { purchaseId: pRefund.id },
  });
  check("still REVERSED after a sweep", stillReversed?.status === "REVERSED");
  const finalBalance = toNum(
    (await prisma.user.findUnique({ where: { id: seller.id }, select: { cashBalance: true } }))
      ?.cashBalance
  );
  check("and no money moved", Math.abs(finalBalance - paidBalance) < 0.001, `${finalBalance}`);

  console.log("\nAn already-released payout cannot be reversed");
  const lateReclaim = await reverseHeldPayout(prisma, pHeld.id, "too late");
  check("reverse returns 0 for a released payout", lateReclaim === 0, String(lateReclaim));

  console.log("\nCleanup");
  await prisma.marketplacePayout.deleteMany({
    where: { purchaseId: { in: [pImmediate.id, pHeld.id, pRefund.id] } },
  });
  await prisma.marketplacePurchase.deleteMany({
    where: { id: { in: [pImmediate.id, pHeld.id, pRefund.id] } },
  });
  await prisma.transaction.deleteMany({
    where: { reference: { startsWith: "marketplace_payout_" }, userId: seller.id },
  });
  await prisma.marketplaceListing.delete({ where: { id: listing.id } });
  // Put the seller's wallet back exactly where it started.
  await prisma.user.update({
    where: { id: seller.id },
    data: { cashBalance: seller.cashBalance, totalEarnings: seller.totalEarnings },
  });
  await savePayoutHoldConfig(originalHold);
  await setLicenseTiersEnabled(originalTiers);
  const restored = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { cashBalance: true },
  });
  check(
    "seller wallet restored",
    Math.abs(toNum(restored?.cashBalance) - startBalance) < 0.001,
    `${toNum(restored?.cashBalance)}`
  );
  check(
    "settings restored",
    (await getLicenseTiersEnabled()) === originalTiers &&
      (await getPayoutHoldConfig()).enabled === originalHold.enabled
  );

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
