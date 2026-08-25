import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  computeTotals,
  createInvoice,
  nextInvoiceNumber,
  settleInvoice,
  snapshotBillTo,
} from "../src/lib/invoices";
import { renderInvoicePdf } from "../src/lib/invoice-pdf";
import { toNum } from "../src/lib/money";

/**
 * Phase D verification — advertiser invoicing.
 *
 * "Mark paid" is a button that gives away money, clicked by a human, and the
 * whole design rests on it being safe to press twice. So most of this is about
 * that: the ledger's unique reference, the conditional status claim, and the
 * fact that neither can be bypassed by the other paths that issue documents.
 *
 * The second theme is honesty of the document itself — a total that does not
 * match its own lines, or a "bill to" that silently changes after a client has
 * the PDF, is the kind of thing that ends a business relationship.
 *
 * Creates and tears down its own user, invoice, booking and campaign fixtures.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-invoicing.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", p), "utf8");
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SANDBOX = "zz-verify-invoicing";
const cleanupIds: string[] = [];

async function main() {
  console.log("\n=== Advertiser invoicing ===\n");

  /* 1. The arithmetic. */
  console.log("1. A document totals what it shows");
  {
    const t = computeTotals(
      [
        { description: "Ad credit", quantity: 1, unitUsd: 100 },
        { description: "Banner, 1 month", quantity: 2, unitUsd: 49.99 },
      ],
      { taxPct: 15 }
    );
    check("lines are priced individually", t.lines[1].amountUsd === 99.98);
    check("subtotal is the sum of the lines", t.subtotalUsd === 199.98, String(t.subtotalUsd));
    check("tax is a percentage of the taxable amount", t.taxUsd === 30.0, String(t.taxUsd));
    check("the total is taxable plus tax", t.totalUsd === 229.98, String(t.totalUsd));
  }
  {
    // Floats would give 0.30000000000000004 here.
    const t = computeTotals([{ description: "x", quantity: 3, unitUsd: 0.1 }], {});
    check("thirds of a cent do not leak float error", t.subtotalUsd === 0.3, String(t.subtotalUsd));
  }
  {
    const t = computeTotals([{ description: "x", quantity: 1, unitUsd: 50 }], {
      discountUsd: 80,
      taxPct: 10,
    });
    check("a discount can zero an invoice but never invert it", t.totalUsd === 0, String(t.totalUsd));
    check("and it is capped at the subtotal", t.discountUsd === 50, String(t.discountUsd));
  }
  {
    const t = computeTotals([{ description: "x", quantity: 1, unitUsd: 100 }], {
      taxPct: 0,
    });
    check("at 0% there is no tax to add", t.taxUsd === 0 && t.totalUsd === 100);
  }
  {
    const s = code("lib/invoice-pdf.ts");
    check(
      "and the PDF omits the tax line entirely rather than printing $0.00",
      /if \(inv\.taxPct > 0\) \{/.test(s)
    );
  }

  /* 2. Numbering. */
  console.log("\n2. Numbering");
  const num = await nextInvoiceNumber(2099);
  check("the first of a year is 0001", num === "INV-2099-0001", num);
  {
    const s = code("lib/invoices.ts");
    check(
      "a collision retries rather than handing out a duplicate",
      /code === "P2002" && attempt < 3\) continue;/.test(s)
    );
  }
  {
    const dbUnique = (await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes WHERE indexname = 'Invoice_number_key'
    `) as unknown[];
    check("the database enforces uniqueness, not just the code", dbUnique.length === 1);
  }

  /* 3. Fixtures. */
  const user = await prisma.user.create({
    data: {
      email: `${SANDBOX}@verify.local`,
      name: "Verify Advertiser",
      referralCode: "ZZVERINV1",
      adCreditBalance: 0,
    },
  });
  cleanupIds.push(user.id);
  await prisma.billingProfile.create({
    data: {
      userId: user.id,
      orgName: "Acme Ltd",
      taxId: "BIN-123",
      city: "Dhaka",
      country: "BD",
    },
  });

  /* 4. The snapshot. */
  console.log("\n3. The bill-to is frozen when the invoice is issued");
  const invoice = await createInvoice({
    advertiserId: user.id,
    lines: [{ description: "Ad credit", quantity: 1, unitUsd: 200, kind: "AD_CREDIT" }],
  });
  const snap = invoice.billTo as { name?: string; taxId?: string };
  check("it captures the company, not the login name", snap?.name === "Acme Ltd");
  check("and the tax id", snap?.taxId === "BIN-123");

  await prisma.billingProfile.update({
    where: { userId: user.id },
    data: { orgName: "Renamed Ltd", taxId: "BIN-999" },
  });
  const after = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  const snapAfter = after?.billTo as { name?: string; taxId?: string };
  check(
    "editing the profile afterwards does NOT rewrite the issued document",
    snapAfter?.name === "Acme Ltd" && snapAfter?.taxId === "BIN-123",
    JSON.stringify(snapAfter)
  );
  {
    const live = await snapshotBillTo(user.id);
    check("while a NEW invoice would pick up the change", live.name === "Renamed Ltd");
  }

  /* 5. Settlement — the money. */
  console.log("\n4. Marking paid, and marking paid again");
  const before = await prisma.user.findUnique({
    where: { id: user.id },
    select: { adCreditBalance: true },
  });
  const first = await settleInvoice(invoice.id, { paymentRef: "TRX-1" });
  check("the first settle succeeds", first.ok === true);
  check(
    "and credits exactly the AD_CREDIT lines",
    first.ok && first.creditedUsd === 200,
    first.ok ? String(first.creditedUsd) : "not ok"
  );
  const mid = await prisma.user.findUnique({
    where: { id: user.id },
    select: { adCreditBalance: true },
  });
  check(
    "the balance moved by that much and no more",
    toNum(mid!.adCreditBalance) - toNum(before!.adCreditBalance) === 200,
    `${toNum(before!.adCreditBalance)} -> ${toNum(mid!.adCreditBalance)}`
  );

  const second = await settleInvoice(invoice.id, { paymentRef: "TRX-1-AGAIN" });
  check("a second settle is refused", second.ok === false);
  check(
    "with a reason the UI can act on",
    !second.ok && second.reason === "ALREADY_PAID",
    !second.ok ? second.reason : ""
  );
  const end = await prisma.user.findUnique({
    where: { id: user.id },
    select: { adCreditBalance: true },
  });
  check(
    "and the balance did NOT move again",
    toNum(end!.adCreditBalance) === toNum(mid!.adCreditBalance),
    `${toNum(mid!.adCreditBalance)} -> ${toNum(end!.adCreditBalance)}`
  );
  {
    const ledger = await prisma.adCreditLedger.findMany({
      where: { userId: user.id, reference: `invoice_${invoice.id}` },
    });
    check("exactly one ledger row exists for the invoice", ledger.length === 1);
    check(
      "and it records the real cash, which the revenue report reads",
      toNum(ledger[0]?.delta) === 200 &&
        (ledger[0]?.metadata as { paidUsd?: number })?.paidUsd === 200
    );
  }
  {
    const dbUnique = (await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'AdCreditLedger_userId_reference_key'
    `) as unknown[];
    check(
      "the ledger's replay guard exists in the database, not only in code",
      dbUnique.length === 1
    );
  }

  /* 6. Line kinds do what they say. */
  console.log("\n5. Only AD_CREDIT lines move credit");
  {
    const adjust = await createInvoice({
      advertiserId: user.id,
      lines: [{ description: "Late fee", quantity: 1, unitUsd: 25, kind: "ADJUSTMENT" }],
    });
    const r = await settleInvoice(adjust.id);
    check("an ADJUSTMENT line credits nothing", r.ok && r.creditedUsd === 0);
    const bal = await prisma.user.findUnique({
      where: { id: user.id },
      select: { adCreditBalance: true },
    });
    check(
      "so the balance is untouched by it",
      toNum(bal!.adCreditBalance) === toNum(end!.adCreditBalance)
    );
  }

  /* 7. A rental line activates its booking. */
  console.log("\n6. A rental line starts the space it paid for");
  const placement = await prisma.adPlacement.create({
    data: {
      name: "ZZ_VERIFY_INV_SPACE",
      platform: "ALL",
      isActive: true,
      monthlyUsd: 300,
      isRentable: true,
    },
  });
  const campaign = await prisma.adCampaign.create({
    data: { title: "ZZ verify invoicing campaign", budget: 0, status: "ACTIVE" },
  });
  const booking = await prisma.adSlotBooking.create({
    data: {
      placementId: placement.id,
      campaignId: campaign.id,
      advertiserId: user.id,
      startAt: new Date(Date.now() - 86_400_000),
      endAt: new Date(Date.now() + 86_400_000),
      priceUsd: 300,
      status: "PENDING_PAYMENT",
    },
  });
  const rentalInvoice = await createInvoice({
    advertiserId: user.id,
    lines: [
      {
        description: "Banner, 1 month",
        quantity: 1,
        unitUsd: 300,
        kind: "SLOT_RENTAL",
        refId: booking.id,
      },
    ],
  });
  const rentalResult = await settleInvoice(rentalInvoice.id);
  check("settling activates the booking", rentalResult.ok && rentalResult.activatedBookings === 1);
  {
    const b = await prisma.adSlotBooking.findUnique({ where: { id: booking.id } });
    check("the booking is ACTIVE afterwards", b?.status === "ACTIVE");
  }
  check(
    "and a SLOT_RENTAL line credits no ad credit",
    rentalResult.ok && rentalResult.creditedUsd === 0
  );

  /* 8. Guard rails on the routes. */
  console.log("\n7. Route rules");
  {
    const s = code("app/api/admin/invoices/route.ts");
    check(
      "an invoice marked paid on issue is SETTLED, not just labelled",
      /settled = await settleInvoice\(invoice\.id/.test(s)
    );
    check(
      "a rental line must name a booking the same advertiser owns",
      /That booking belongs to a different advertiser/.test(s)
    );
    check(
      "the advertiser email is resolved server-side (ads admins lack users.view)",
      /advertiserEmail: z\.string\(\)\.email\(\)\.optional\(\)/.test(s)
    );
    check("issuing needs ads.manage", /can\(session\.user\.id, "ads\.manage"\)/.test(s));
  }
  {
    const s = code("app/api/admin/invoices/[id]/route.ts");
    check(
      "a PAID invoice cannot be voided — that would strand the credit",
      /A paid invoice cannot be voided/.test(s)
    );
    check(
      "a settled invoice can no longer be edited",
      /can no longer be edited/.test(s)
    );
  }
  {
    const s = code("app/api/invoices/[id]/pdf/route.ts");
    check("the owner can download their own", /invoice\.advertiserId === session\.user\.id/.test(s));
    check(
      "a stranger gets 404, not 403 — existence is not leaked",
      /a stranger should not learn that this invoice exists|status: 404/.test(
        src("app/api/invoices/[id]/pdf/route.ts")
      )
    );
  }
  {
    const s = code("lib/ad-credits.ts");
    check(
      "a self-serve top-up issues its own receipt",
      /kind: "RECEIPT"/.test(s)
    );
    check(
      "and the receipt shows the cash paid, not the bonused credit",
      /unitUsd: amountUsd,/.test(s)
    );
  }

  /* 9. The PDF renders. */
  console.log("\n8. The document renders");
  for (const [label, kind, taxPct] of [
    ["a bill", "BILL", 15],
    ["a receipt", "RECEIPT", 0],
  ] as const) {
    const pdf = await renderInvoicePdf({
      number: "INV-2099-0001",
      kind,
      status: kind === "RECEIPT" ? "PAID" : "SENT",
      issuedAt: new Date(),
      dueAt: new Date(),
      paidAt: kind === "RECEIPT" ? new Date() : null,
      paymentRef: "TRX-1",
      notes: "Thanks for your business",
      seller: {
        name: "EarnGPT",
        addressLines: ["Dhaka, Bangladesh"],
        email: "billing@example.com",
        phone: "+880",
        taxId: "BIN-1",
      },
      billTo: {
        name: "Acme Ltd",
        email: "a@b.com",
        phone: "",
        taxId: "BIN-123",
        addressLines: ["Dhaka", "BD"],
      },
      lines: [{ description: "Ad credit", quantity: 1, unitUsd: 200, amountUsd: 200 }],
      subtotalUsd: 200,
      discountUsd: 0,
      taxPct,
      taxLabel: "VAT",
      taxUsd: taxPct > 0 ? 30 : 0,
      totalUsd: taxPct > 0 ? 230 : 200,
      localLine: "= 25,000 at $1 = 125",
    });
    check(`${label} renders a valid, non-empty PDF`, pdf.length > 1000);
    check(
      `${label} starts with the PDF magic bytes`,
      pdf.subarray(0, 4).toString() === "%PDF"
    );
  }
  {
    // Bangla and the taka sign are outside WinAnsi; pdf-lib throws on them.
    const pdf = await renderInvoicePdf({
      number: "INV-2099-0002",
      kind: "BILL",
      status: "SENT",
      issuedAt: new Date(),
      dueAt: null,
      paidAt: null,
      paymentRef: null,
      notes: "বাংলা নোট 🎉",
      seller: { name: "আর্নজিপিটি", addressLines: ["ঢাকা"], email: "", phone: "", taxId: "" },
      billTo: { name: "ক্লায়েন্ট", email: "", phone: "", taxId: "", addressLines: ["ঢাকা"] },
      lines: [{ description: "বিজ্ঞাপন ৳", quantity: 1, unitUsd: 10, amountUsd: 10 }],
      subtotalUsd: 10,
      discountUsd: 0,
      taxPct: 0,
      taxLabel: null,
      taxUsd: 0,
      totalUsd: 10,
      localLine: "৳1,250",
    });
    check(
      "non-Latin text does not crash the renderer (it is stripped, not thrown on)",
      pdf.length > 1000 && pdf.subarray(0, 4).toString() === "%PDF"
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Tear down on success AND failure — a stray ACTIVE booking would take a
    // real space hostage, and a stray invoice would show on the owner's list.
    await prisma.adSlotBooking
      .deleteMany({ where: { placement: { name: { startsWith: "ZZ_VERIFY_INV" } } } })
      .catch(() => {});
    await prisma.adPlacement
      .deleteMany({ where: { name: { startsWith: "ZZ_VERIFY_INV" } } })
      .catch(() => {});
    await prisma.adCampaign
      .deleteMany({ where: { title: { startsWith: "ZZ verify invoicing" } } })
      .catch(() => {});
    for (const id of cleanupIds) {
      await prisma.invoice.deleteMany({ where: { advertiserId: id } }).catch(() => {});
      await prisma.adCreditLedger.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.billingProfile.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
