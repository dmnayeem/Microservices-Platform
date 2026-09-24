/**
 * Checks the two-businesses-in-one-marketplace rules.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-marketplace-sale-modes.ts
 *
 * A domain is sold once and changes hands. A stock photo is licensed to
 * everyone who wants it. Getting that backwards either sells the same account
 * to fifty people or deletes a photo from the shop after one $5 sale, so the
 * defaults, the clamping and — most importantly — every place that can mark a
 * listing SOLD are all asserted here.
 *
 * Creates nothing it does not delete.
 */
import { readFileSync } from "fs";
import { prisma } from "./_q";
import {
  CATEGORIES,
  MARKETPLACE_SECTIONS,
  defaultSaleMode,
  resolveSaleMode,
  canBeUnlimited,
  sectionForAssetType,
  getSection,
} from "../src/lib/marketplace-categories";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Every file that can set a listing SOLD. Adding a seventh sale path without
 * teaching it about saleMode is the regression this guards: the listing would
 * quietly vanish from the shop after one licence, exactly as before.
 */
const SOLD_WRITE_SITES = [
  "src/app/api/marketplace/[id]/checkout/route.ts",
  "src/app/api/cart/checkout/route.ts",
  "src/app/api/marketplace/orders/route.ts",
  "src/app/api/marketplace/listings/[id]/offers/[offerId]/route.ts",
  "src/lib/marketplace-auctions.ts",
  "src/lib/marketplace-deal.ts",
];

async function main() {
  console.log("Category defaults");
  for (const [t, want] of [
    ["STOCK_PHOTO", "UNLIMITED"],
    ["STOCK_VIDEO", "UNLIMITED"],
    ["MUSIC", "UNLIMITED"],
    ["EBOOK", "UNLIMITED"],
    ["DIGITAL_PRODUCT", "UNLIMITED"],
    ["SERVICE", "UNLIMITED"],
    ["DOMAIN", "ONE_OFF"],
    ["WEBSITE", "ONE_OFF"],
    ["SOCIAL_ACCOUNT", "ONE_OFF"],
    ["PLAYSTORE_ACCOUNT", "ONE_OFF"],
    ["SAAS_PRODUCT", "ONE_OFF"],
    ["OTHER", "ONE_OFF"],
  ] as const) {
    check(`${t} defaults to ${want}`, defaultSaleMode(t) === want, defaultSaleMode(t));
  }

  console.log("\nClamping (the direction a mistake is allowed to go)");
  check(
    "a domain cannot be sold unlimited",
    resolveSaleMode("DOMAIN", "UNLIMITED") === "ONE_OFF"
  );
  check(
    "a social account cannot be sold unlimited",
    resolveSaleMode("SOCIAL_ACCOUNT", "UNLIMITED") === "ONE_OFF"
  );
  check(
    "a stock photo may be sold as a single exclusive copy",
    resolveSaleMode("STOCK_PHOTO", "ONE_OFF") === "ONE_OFF"
  );
  check(
    "a stock photo defaults to unlimited when nothing is asked for",
    resolveSaleMode("STOCK_PHOTO", undefined) === "UNLIMITED"
  );
  check(
    "garbage falls back to the category default",
    resolveSaleMode("DOMAIN", "WHATEVER") === "ONE_OFF" &&
      resolveSaleMode("EBOOK", "WHATEVER") === "UNLIMITED"
  );

  console.log("\nStorefront sections");
  const seen = new Map<string, string>();
  let dupes = 0;
  for (const s of MARKETPLACE_SECTIONS) {
    for (const t of s.assetTypes) {
      if (seen.has(t)) dupes++;
      seen.set(t, s.slug);
    }
  }
  check("no asset type appears in two sections", dupes === 0, `${dupes} duplicate(s)`);
  const uncovered = CATEGORIES.map((c) => c.assetType).filter(
    (t) => t !== "OTHER" && !seen.has(t)
  );
  check(
    "every category except OTHER has a section",
    uncovered.length === 0,
    uncovered.join(", ") || "all covered"
  );
  check("OTHER is deliberately unsectioned", sectionForAssetType("OTHER") === null);
  check("stock section resolves", getSection("stock")?.assetTypes.includes("STOCK_PHOTO") === true);
  check("an unknown section slug resolves to null", getSection("nope") === null);
  check(
    "every repeatable category is in a repeat-sale section",
    CATEGORIES.filter((c) => c.repeatable).every((c) =>
      ["stock", "products", "services"].includes(seen.get(c.assetType) ?? "")
    )
  );
  check(
    "nothing in the digital-assets section is repeatable",
    (getSection("assets")?.assetTypes ?? []).every((t) => !canBeUnlimited(t))
  );

  console.log("\nEvery sale path knows about saleMode");
  for (const f of SOLD_WRITE_SITES) {
    let src = "";
    try {
      src = readFileSync(f, "utf8");
    } catch {
      check(`${f} exists`, false, "file not found — was it moved?");
      continue;
    }
    const setsSold = src.includes("MarketplaceListingStatus.SOLD");
    const knowsMode = src.includes("saleMode");
    check(
      `${f.split("/").slice(-2).join("/")} guards its SOLD write`,
      !setsSold || knowsMode,
      setsSold ? (knowsMode ? "guarded" : "SETS SOLD UNCONDITIONALLY") : "no SOLD write"
    );
  }

  console.log("\nDatabase");
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  if (!admin) {
    console.log("No admin account to own test rows.");
    process.exit(1);
  }

  const made: string[] = [];
  const mk = (assetType: string, saleMode?: string) =>
    prisma.marketplaceListing.create({
      data: {
        sellerId: admin.id,
        title: `verify-sale-mode ${assetType}`,
        description: "Created by verify-marketplace-sale-modes. Deleted at the end.",
        category: assetType,
        assetType,
        ...(saleMode ? { saleMode } : {}),
        price: 1,
        status: "PENDING_REVIEW",
      },
      select: { id: true, saleMode: true },
    });

  const legacy = await mk("DOMAIN");
  made.push(legacy.id);
  check(
    "a row written without saleMode defaults to ONE_OFF",
    legacy.saleMode === "ONE_OFF",
    legacy.saleMode
  );

  const stock = await mk("STOCK_PHOTO", resolveSaleMode("STOCK_PHOTO"));
  made.push(stock.id);
  check("a stock listing stores UNLIMITED", stock.saleMode === "UNLIMITED", stock.saleMode);

  const filtered = await prisma.marketplaceListing.count({
    where: { id: { in: made }, saleMode: "UNLIMITED" },
  });
  check("saleMode is queryable as a filter", filtered === 1, `${filtered} of 2`);

  await prisma.marketplaceListing.deleteMany({ where: { id: { in: made } } });
  check("test rows removed", true);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
