import { getSetting } from "@/lib/system-settings";
import { prisma } from "@/lib/prisma";

/**
 * Admin-configurable MANUAL deposit methods (Binance, mobile-banking, PayPal,
 * Payoneer, or any custom digital wallet). Each carries a receiving `account`
 * (UID / number / email / address) + instructions that the user is shown so they
 * know exactly where to send money. Stored as one SystemSetting array
 * (`deposit_methods`, category `payment_methods`). Users deposit with a txn id +
 * proof; an admin approves → wallet cash is credited (existing Deposit flow).
 */
export interface DepositMethod {
  /** Stable key stored on the Deposit row (e.g. "binance", "bkash", or a slug). */
  key: string;
  label: string;
  /** What the receiving account IS (e.g. "Binance UID", "bKash number", "PayPal email"). */
  accountLabel?: string;
  /** Receiving account shown to users: Binance UID, bKash number, email, address… */
  account: string;
  /** Optional QR image (URL) the user can scan to pay. */
  qrUrl?: string;
  /** Optional payment/deep link (e.g. PayPal.me or Binance Pay URL). */
  payLink?: string;
  instructions: string;
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  /** Extra charge % the user pays on top (e.g. bKash personal Send Money fee). */
  chargePct?: number;
  /** How the charge applies: personal → charge, cash-out/none → no charge. */
  chargeType?: "none" | "personal" | "cashout";
}

const SETTING_KEY = "deposit_methods";

export const DEPOSIT_METHOD_PRESETS: DepositMethod[] = [
  { key: "binance", label: "Binance Pay", accountLabel: "Binance Pay ID / UID", account: "", instructions: "Send via Binance Pay to the ID above, then paste the transaction ID.", enabled: false, minAmount: 1, maxAmount: 100000 },
  // Mobile-banking presets carry the personal send-money fee that scales with
  // amount: bKash 20 BDT / 1000 (2%), Nagad & DBBL/Rocket 15 / 1000 (1.5%).
  { key: "bkash", label: "bKash", accountLabel: "bKash number", account: "", instructions: "Send Money to the number above, then enter the bKash TrxID.", enabled: false, minAmount: 1, maxAmount: 100000, chargeType: "personal", chargePct: 2 },
  { key: "nagad", label: "Nagad", accountLabel: "Nagad number", account: "", instructions: "Send Money to the number above, then enter the Nagad TxnID.", enabled: false, minAmount: 1, maxAmount: 100000, chargeType: "personal", chargePct: 1.5 },
  { key: "dbbl", label: "DBBL", accountLabel: "DBBL account / Nexus number", account: "", instructions: "Send to the DBBL account above, then enter the transaction id.", enabled: false, minAmount: 1, maxAmount: 100000, chargeType: "personal", chargePct: 1.5 },
  { key: "rocket", label: "Rocket (DBBL)", accountLabel: "Rocket number", account: "", instructions: "Send to the number above, then enter the Rocket TxnID.", enabled: false, minAmount: 1, maxAmount: 100000, chargeType: "personal", chargePct: 1.5 },
  { key: "paypal", label: "PayPal", accountLabel: "PayPal email", account: "", instructions: "Send to the PayPal email above (Friends & Family), then paste the transaction id.", enabled: false, minAmount: 1, maxAmount: 100000 },
  { key: "payoneer", label: "Payoneer", accountLabel: "Payoneer email / account", account: "", instructions: "Pay to the Payoneer account above, then paste the reference id.", enabled: false, minAmount: 1, maxAmount: 100000 },
];

const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

function normalize(raw: unknown): DepositMethod[] {
  if (!Array.isArray(raw)) return DEPOSIT_METHOD_PRESETS;
  return raw
    .filter((m) => m && typeof m === "object")
    .map((m) => {
      const o = m as Record<string, unknown>;
      const key = String(o.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      return {
        key,
        label: String(o.label ?? key),
        accountLabel: o.accountLabel ? String(o.accountLabel) : undefined,
        account: String(o.account ?? ""),
        qrUrl: o.qrUrl ? String(o.qrUrl) : undefined,
        payLink: o.payLink ? String(o.payLink) : undefined,
        instructions: String(o.instructions ?? ""),
        enabled: o.enabled === true,
        minAmount: num(o.minAmount, 1),
        maxAmount: num(o.maxAmount, 100000),
        chargePct: num(o.chargePct, 0),
        chargeType:
          o.chargeType === "personal" || o.chargeType === "cashout"
            ? o.chargeType
            : "none",
      } satisfies DepositMethod;
    })
    .filter((m) => m.key);
}

/** All configured deposit methods (presets when nothing saved yet). */
export async function getDepositMethods(): Promise<DepositMethod[]> {
  const raw = await getSetting<unknown>(SETTING_KEY, null);
  if (raw == null) return DEPOSIT_METHOD_PRESETS;
  const list = normalize(raw);
  return list.length ? list : DEPOSIT_METHOD_PRESETS;
}

/** Methods a user can actually pay to (enabled AND has a receiving account). */
export async function getEnabledDepositMethods(): Promise<DepositMethod[]> {
  return (await getDepositMethods()).filter((m) => m.enabled && m.account.trim());
}

/** Persist the whole methods array (admin-only at the call site). */
export async function saveDepositMethods(list: DepositMethod[]): Promise<void> {
  const clean = normalize(list);
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, category: "payment_methods", value: clean as unknown as object },
    update: { category: "payment_methods", value: clean as unknown as object },
  });
}
