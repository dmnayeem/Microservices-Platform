import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import {
  DEPOSIT_METHOD_PRESETS,
  type DepositMethod,
} from "../src/lib/deposit-methods";
import { qrPayloadKind } from "../src/lib/deposit-qr";
import {
  computeDepositBreakdown,
  effectiveChargePct,
} from "../src/lib/deposit-pricing";
import { PaymentMethod } from "../src/generated/prisma";
import type { Currency } from "../src/lib/currencies";

/**
 * Bitget, and the crypto fields the deposit rail needed to carry it.
 *
 * The platform already had the right shape for this — admin-configured manual
 * deposit methods with an account, a QR, instructions and a percentage fee —
 * so Bitget is a method on that rail rather than a second payment system. What
 * it did NOT have is everything crypto-specific:
 *
 *   network    the chain to send on. The single most expensive field on the
 *              page: USDT sent on BEP20 to a TRC20 address is unrecoverable.
 *   memo       required by some exchanges to attribute the transfer at all.
 *   feeFlatUsd a network fee costs the same on $5 as on $5,000, so a
 *              percentage either overstates or hides it.
 *   autoQr     draw the QR from the account, so it cannot keep pointing at a
 *              wallet the admin has since changed.
 *
 * The money assertions are the point of this file. `charge` is what the user
 * pays ON TOP of the amount credited to their wallet, and a flat fee that
 * quietly became a percentage — or a percentage that started applying to
 * methods with none — is a silent overcharge on every deposit.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-bitget-deposits.ts
 */

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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const preset = (key: string) => DEPOSIT_METHOD_PRESETS.find((m) => m.key === key);

function main() {
  console.log("\n=== Bitget deposits ===\n");

  /* ── 1. The presets ── */
  console.log("1. Bitget is offered in the two shapes people pay with");
  {
    const pay = preset("bitget");
    const usdt = preset("bitget_usdt");
    check("Bitget Pay (UID) is a preset", !!pay);
    check("Bitget on-chain USDT is a preset", !!usdt);

    // Kept apart on purpose: one is an instant free internal transfer, the
    // other has a chain and a fee. Merged, the user could not tell which set
    // of instructions applied to the payment they were about to make.
    check(
      "the UID method has no network — it is not an on-chain transfer",
      !pay?.network && !(pay?.feeFlatUsd ?? 0)
    );
    check(
      "the on-chain method names its network",
      !!usdt?.network && /TRC20/i.test(usdt!.network!),
      usdt?.network
    );
    check("…and carries the network fee", (usdt?.feeFlatUsd ?? 0) > 0);
    check(
      "…and its instructions warn about the wrong network",
      /network/i.test(usdt?.instructions ?? "") &&
        /lose|lost|cannot/i.test(usdt?.instructions ?? ""),
      "sending on the wrong chain is unrecoverable and must be said before it happens"
    );

    // Both ship OFF with an empty account. A deposit method that is live
    // before the owner has pasted a receiving address would collect payments
    // into nothing.
    for (const m of [pay, usdt]) {
      check(
        `${m?.key} ships disabled with no account set`,
        m?.enabled === false && m?.account === ""
      );
    }
    /* The QR is scanned inside a wallet app at the moment of paying, so the
       only thing that matters is whether the app can act on what it reads.
       An address is the payment payload; a UID is a number, and a QR of a
       number leaves the payer tapping a screen that never reacts — which
       reads as our site being broken, not as their app not supporting it. */
    check(
      "the on-chain address draws its QR from the account",
      usdt?.autoQr === true,
      "the address is the payload, and an uploaded image goes stale the moment the address changes"
    );
    check(
      "the UID method does NOT",
      pay?.autoQr !== true,
      "a generated QR of a Bitget UID scans to a bare number and pays nobody"
    );
  }

  /* ── 2. The money ── */
  console.log("\n2. Fees are charged on top, and only where they apply");
  {
    // A round rate, so every expected number below can be read by eye.
    const bdt: Currency = {
      code: "BDT",
      symbol: "৳",
      usdRate: 120,
      countries: ["BD"],
    };

    // A flat fee on a $100 deposit: the wallet still gets $100, and the user
    // pays $1 more, converted at the same rate.
    const flat = computeDepositBreakdown({
      amountUsd: 100,
      currency: bdt,
      chargePct: 0,
      feeFlatUsd: 1,
      vatEnabled: false,
      vatPct: 0,
    });
    check("the wallet is credited the amount entered", flat.amountUsd === 100);
    check("the flat fee is converted at the currency rate", flat.charge === 120, `${flat.charge}`);
    check("…and added on top, not taken out", flat.totalLocal === 12120, `${flat.totalLocal}`);

    // The same fee on a small deposit must not scale down — that is the whole
    // reason it is flat rather than a percentage.
    const small = computeDepositBreakdown({
      amountUsd: 5,
      currency: bdt,
      chargePct: 0,
      feeFlatUsd: 1,
      vatEnabled: false,
      vatPct: 0,
    });
    check("a flat fee is the same on a small deposit", small.charge === 120, `${small.charge}`);

    // Percentage and flat together, which is what a mobile-banking method with
    // a fixed cost would look like.
    const both = computeDepositBreakdown({
      amountUsd: 100,
      currency: bdt,
      chargePct: 2,
      feeFlatUsd: 1,
      vatEnabled: false,
      vatPct: 0,
    });
    check("percentage and flat add together", both.charge === 240 + 120, `${both.charge}`);

    // VAT already applied to the percentage charge; it must treat the flat fee
    // the same way rather than silently exempting it.
    const vat = computeDepositBreakdown({
      amountUsd: 100,
      currency: bdt,
      chargePct: 0,
      feeFlatUsd: 1,
      vatEnabled: true,
      vatPct: 10,
    });
    check("VAT includes the flat fee", vat.vat === (12000 + 120) * 0.1, `${vat.vat}`);

    // The regression that would cost real money: omitting the field must mean
    // no fee, not NaN and not a default.
    const none = computeDepositBreakdown({
      amountUsd: 100,
      currency: bdt,
      chargePct: 0,
      vatEnabled: false,
      vatPct: 0,
    });
    check("a method with no flat fee is charged nothing", none.charge === 0);
    check("…and the total is exactly the amount", none.totalLocal === 12000);

    // Negative or junk input must not become a credit to the user.
    const junk = computeDepositBreakdown({
      amountUsd: 100,
      currency: bdt,
      chargePct: 0,
      feeFlatUsd: -50,
      vatEnabled: false,
      vatPct: 0,
    });
    check("a negative fee cannot pay the user", junk.charge === 0, `${junk.charge}`);

    // The percentage rule is unchanged: it applies to "personal" only.
    check(
      "the percentage still applies only to personal-charge methods",
      effectiveChargePct({ chargePct: 2, chargeType: "personal" }) === 2 &&
        effectiveChargePct({ chargePct: 2, chargeType: "cashout" }) === 0 &&
        effectiveChargePct({ chargePct: 2, chargeType: "none" }) === 0
    );
  }

  /* ── 3. Bitget reaches the things people buy ── */
  console.log("\n3. Bitget is usable everywhere money is");
  {
    // The wallet is the hub: a deposit becomes cash, and cash already buys
    // subscriptions, buyer funding, courses and the marketplace. The only
    // thing needing its own entry is the direct off-platform purchase, where
    // Binance was already listed.
    check(
      "BITGET exists on the PaymentMethod enum",
      Object.values(PaymentMethod).includes("BITGET" as PaymentMethod),
      Object.values(PaymentMethod).join(", ")
    );
    const purchase = read("src/app/api/packages/purchase/route.ts");
    check(
      "a subscription can be bought with Bitget",
      /"BITGET"/.test(purchase) && /PaymentMethod\.BITGET/.test(purchase)
    );
    check(
      "…and it is treated as off-platform, so an admin still verifies it",
      /\["CARD", "BKASH", "NAGAD", "BINANCE", "BITGET"\]/.test(purchase),
      "an unverified crypto purchase must not activate a plan by itself"
    );
    check(
      "the purchase screen offers it",
      /value: "BITGET"/.test(read("src/components/user/packages/packages-view.tsx"))
    );
    // Withdrawals share the enum, and those maps are exhaustive by type — but
    // a wrong minimum is not a type error.
    const methods = read("src/app/api/payment-methods/route.ts");
    check(
      "withdrawing to Bitget has a name, an icon, a minimum and a fee",
      (methods.match(/BITGET:/g) ?? []).length === 4,
      `${(methods.match(/BITGET:/g) ?? []).length} of 4 maps`
    );
  }

  /* ── 4. The screens ── */
  console.log("\n4. Copy, QR, network and memo are on the screen");
  {
    const view = read("src/components/user/wallet/deposit-view.tsx");
    // An address is too long to retype and a mistyped one loses the money, so
    // every value the user must reproduce needs its own copy button.
    check(
      "every copyable value has a copy button, not just the account",
      /copy\(selected\.network/.test(view) && /copy\(selected\.memo/.test(view)
    );
    check(
      "the network is shown as its own warned line",
      /cannot be recovered/.test(view),
      "buried in a paragraph it gets skipped, and the money is gone"
    );
    check("the memo is marked required where present", /Memo \/ Tag \(required\)/.test(view));
    check(
      "the QR falls back to one drawn from the account",
      /api\/deposits\/qr\?method=/.test(view) && /selected\.autoQr/.test(view)
    );
    check(
      "an uploaded QR still wins when the admin set one",
      /selected\.qrUrl \? \(/.test(view)
    );
    check(
      "the fee line names a flat fee instead of reading “0%”",
      /network fee/.test(view) && /chargePct > 0 &&/.test(view)
    );

    // The QR route must not render an arbitrary address handed to it.
    const qr = read("src/app/api/deposits/qr/route.ts");
    check(
      "the QR is drawn from the saved method, never from the query string",
      /getEnabledDepositMethods\(\)/.test(qr) &&
        !/searchParams\.get\("account"\)/.test(qr),
      "otherwise the link is a way to hand someone a QR for a wallet we do not own"
    );
    check(
      "a disabled or unknown method renders nothing",
      /status: 404/.test(qr)
    );

    const form = read("src/components/admin/payment-methods/deposit-methods-form.tsx");
    for (const field of ["network", "memo", "autoQr", "feeFlatUsd"]) {
      check(`the admin can edit ${field}`, new RegExp(`${field}`).test(form));
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
   A new method has to reach an install that is already configured
   ══════════════════════════════════════════════════════════════════════════
   This suite passed while the feature was invisible, and that is the lesson
   worth keeping. It checked that the Bitget presets exist in the code. They
   did. What nothing checked was whether they could ever be SEEN: the saved
   list is whatever the admin last pressed Save on, `normalize` returned
   exactly that, and this platform's saved list predated Bitget by a few days.
   Seven methods in the column, nine in the code, and the owner could not find
   the one he had asked for.

   So the check is not "is Bitget in the presets" — it is "does a preset the
   saved list has never heard of get added to it". */
{
  const lib = read("src/lib/deposit-methods.ts");
  check(
    "presets the saved list has never seen are added to it",
    /function withNewPresets/.test(lib) && /withNewPresets\(list\)/.test(lib),
    "without this, shipping a payment method reaches nobody who has configured deposits even once"
  );
  check(
    "a saved method always wins over its preset",
    /const known = new Set\(saved\.map/.test(lib),
    "an admin's own UID must never be overwritten by a shipped default"
  );
  check(
    "a newly appearing method arrives switched off",
    /enabled: false/.test(lib),
    "it must be visible to the admin and invisible to users until an account is filled in"
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   A generated QR must be one a wallet app can act on
   ══════════════════════════════════════════════════════════════════════════
   The owner asked whether the Bitget QR has to be downloaded from the app or
   is made here, and then said what settles it: the QR is scanned at the
   moment of paying. That makes the test not "does a QR appear" but "does the
   payer's app do something when it reads it".

   A wallet address is the payment payload and every wallet reads one. A UID,
   a phone number or an email is not: the scan yields that text, the app shows
   nothing, and the payer concludes the site is broken. So the decision is
   made from the account itself, in three places that must agree — the admin
   warning, the drawing route, and the screen that shows it. */
{
  console.log("\nThe generated QR only exists where scanning does something");

  const ADDRESSES = [
    "TQ5NMqJjaGqn7ZbRRd8rBmqzxqZ8N1o4Rm", // TRC20
    "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // ERC20/BEP20
    "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", // bech32
  ];
  const NOT_ADDRESSES = [
    "8456921037", // a Bitget UID
    "01712345678", // a bKash number
    "+8801712345678",
    "owner@example.com", // PayPal
    "Nayeem Ahmed", // a name someone typed in the wrong box
    "", // nothing filled in yet
  ];
  check(
    `wallet addresses are treated as scannable (${ADDRESSES.length})`,
    ADDRESSES.every((a) => qrPayloadKind(a) === "address"),
    ADDRESSES.filter((a) => qrPayloadKind(a) !== "address").join(", ")
  );
  check(
    `UIDs, phone numbers and emails are not (${NOT_ADDRESSES.length})`,
    NOT_ADDRESSES.every((a) => qrPayloadKind(a) === "plain"),
    NOT_ADDRESSES.filter((a) => qrPayloadKind(a) !== "plain").join(", ")
  );
  check(
    "a pay link stays scannable — the phone opens it",
    qrPayloadKind("https://pay.example.com/abc") === "link" &&
      qrPayloadKind("bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq") === "link"
  );

  const qr = read("src/app/api/deposits/qr/route.ts");
  check(
    "the route refuses to draw a QR of a bare number",
    /qrPayloadKind\(method\.account\) === "plain"/.test(qr),
    "a mistaken tick in settings would otherwise hand every payer a dead code"
  );
  const view = read("src/components/user/wallet/deposit-view.tsx");
  check(
    "…and the screen does not ask for one it would not get",
    /qrPayloadKind\(selected\.account\) !== "plain"/.test(view),
    "asking anyway shows the user a broken image, which is worse than no QR"
  );
  const form = read("src/components/admin/payment-methods/deposit-methods-form.tsx");
  check(
    "the admin is told, at the moment of ticking it, where the real QR comes from",
    /qrPayloadKind\(m\.account\) === "plain"/.test(form) &&
      /Pay → Receive/.test(form),
    "an admin who ticks it and sees nothing has no way to know why"
  );
}

console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
  void (null as unknown as DepositMethod);
}

main();
