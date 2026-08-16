import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { CreditCard, Save, Wallet } from "lucide-react";
import { PaymentMethodsForm } from "@/components/admin/payment-methods/payment-methods-form";
import { DepositMethodsForm } from "@/components/admin/payment-methods/deposit-methods-form";
import { CurrenciesForm } from "@/components/admin/payment-methods/currencies-form";
import { getDepositMethods } from "@/lib/deposit-methods";
import { getCurrencies } from "@/lib/currencies";

const DEFAULT_METHODS = [
  // Mobile banking
  {
    key: "BKASH",
    name: "bKash",
    category: "mobile",
    icon: "📱",
    enabled: true,
    minAmount: 5,
    maxAmount: 500,
    feePct: 1.5,
    feeFlat: 0,
    processingTime: "Instant – 24 hours",
    requiredFields: ["mobile_number", "account_name"],
    countries: ["BD"],
    instructions: "Enter your bKash account mobile number.",
  },
  {
    key: "NAGAD",
    name: "Nagad",
    category: "mobile",
    icon: "📱",
    enabled: true,
    minAmount: 5,
    maxAmount: 500,
    feePct: 1.5,
    feeFlat: 0,
    processingTime: "Instant – 24 hours",
    requiredFields: ["mobile_number", "account_name"],
    countries: ["BD"],
    instructions: "Enter your Nagad mobile number.",
  },
  {
    key: "ROCKET",
    name: "Rocket",
    category: "mobile",
    icon: "📱",
    enabled: true,
    minAmount: 5,
    maxAmount: 500,
    feePct: 1.8,
    feeFlat: 0,
    processingTime: "1–2 days",
    requiredFields: ["mobile_number", "account_name"],
    countries: ["BD"],
    instructions: "Enter your Rocket mobile number.",
  },
  // Bank
  {
    key: "BANK_BD",
    name: "Bank Transfer (BEFTN)",
    category: "bank",
    icon: "🏦",
    enabled: false,
    minAmount: 20,
    maxAmount: 5000,
    feePct: 0,
    feeFlat: 1,
    processingTime: "1–3 days",
    requiredFields: ["account_number", "account_name", "bank_name", "branch"],
    countries: ["BD"],
    instructions: "Local bank transfer via BEFTN.",
  },
  {
    key: "BANK_SWIFT",
    name: "Bank Transfer (SWIFT)",
    category: "bank",
    icon: "🏦",
    enabled: false,
    minAmount: 100,
    maxAmount: 50000,
    feePct: 0,
    feeFlat: 15,
    processingTime: "3–5 days",
    requiredFields: ["account_number", "account_name", "swift_code", "bank_address"],
    countries: ["WORLDWIDE"],
    instructions: "International wire transfer via SWIFT.",
  },
  // Wallets
  {
    key: "PAYPAL",
    name: "PayPal",
    category: "wallet",
    icon: "💳",
    enabled: true,
    minAmount: 10,
    maxAmount: 5000,
    feePct: 2.5,
    feeFlat: 0,
    processingTime: "1–3 days",
    requiredFields: ["paypal_email"],
    countries: ["WORLDWIDE"],
    instructions: "Enter the email tied to your PayPal account.",
  },
  // Crypto
  {
    key: "BINANCE",
    name: "Binance Pay",
    category: "crypto",
    icon: "₿",
    enabled: true,
    minAmount: 20,
    maxAmount: 50000,
    feePct: 0.5,
    feeFlat: 0,
    processingTime: "1–24 hours",
    requiredFields: ["binance_uid"],
    countries: ["WORLDWIDE"],
    instructions: "Enter your Binance UID.",
  },
  {
    key: "USDT_TRC20",
    name: "USDT (TRC-20)",
    category: "crypto",
    icon: "₿",
    enabled: false,
    minAmount: 10,
    maxAmount: 50000,
    feePct: 0,
    feeFlat: 1,
    processingTime: "Minutes",
    requiredFields: ["wallet_address"],
    countries: ["WORLDWIDE"],
    instructions: "Enter your USDT TRC-20 wallet address.",
  },
];

export default async function PaymentMethodsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const adminRole = session.user.role as UserRole | undefined;
  if (!hasPermission(adminRole, "payment_methods.view")) redirect("/admin");

  const canManage = hasPermission(adminRole, "payment_methods.manage");

  // Load saved configurations from SystemSetting under "payment_methods" category
  const rows = await prisma.systemSetting.findMany({
    where: { category: "payment_methods" },
  });
  const stored = new Map<string, unknown>();
  for (const r of rows) stored.set(r.key.replace("pm_", ""), r.value);

  // Merge defaults with stored values
  const methods = DEFAULT_METHODS.map((d) => {
    const s = stored.get(d.key) as Record<string, unknown> | undefined;
    return s ? { ...d, ...s } : d;
  });

  const depositMethods = await getDepositMethods();
  const currencies = await getCurrencies();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-400" />
          Payment Method Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure withdrawal/payout methods, fees, and processing times.
          {!canManage && (
            <span className="ml-2 text-amber-400">
              View-only — your role cannot edit these.
            </span>
          )}
        </p>
      </div>

      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Payout methods (withdrawals)</h2>
        <PaymentMethodsForm initial={methods} canEdit={canManage} />
      </div>

      <div className="pt-2 border-t border-slate-800">
        <h2 className="text-lg font-bold text-white inline-flex items-center gap-2 mt-4">
          <Wallet className="w-5 h-5 text-emerald-400" />
          Deposit methods (where users send money)
        </h2>
        <p className="text-slate-400 text-sm mt-1 mb-3">
          Manual / Binance methods users pay to, then submit a transaction id + proof.
          You verify &amp; approve → their wallet is credited. Set a receiving account
          and instructions for each.
        </p>
        <DepositMethodsForm initial={depositMethods} canEdit={canManage} />
      </div>

      <div className="pt-2 border-t border-slate-800">
        <h2 className="text-lg font-bold text-white inline-flex items-center gap-2 mt-4">
          <CreditCard className="w-5 h-5 text-amber-400" />
          Local currencies (deposit conversion)
        </h2>
        <p className="text-slate-400 text-sm mt-1 mb-3">
          Popular currencies + USD rate shown on the deposit page based on the
          user&apos;s country (e.g. $1 = ৳125). Toggle VAT under Settings →
          Financial.
        </p>
        <CurrenciesForm initial={currencies} canEdit={canManage} />
      </div>

      <p className="text-xs text-slate-500 inline-flex items-center gap-2">
        <Save className="w-3 h-3" />
        Payout config → <code className="text-slate-400">pm_</code> rows; deposit methods →{" "}
        <code className="text-slate-400">deposit_methods</code>.
      </p>
    </div>
  );
}
