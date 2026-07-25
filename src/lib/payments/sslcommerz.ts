import { getSecret } from "@/lib/system-settings";
import type {
  PaymentProvider,
  InitCheckoutInput,
  InitCheckoutResult,
  VerifyInput,
  VerifyResult,
} from "./provider";

async function keys() {
  const storeId = await getSecret("SSLCOMMERZ_STORE_ID", "sslcommerz.storeId");
  const storePasswd = await getSecret("SSLCOMMERZ_STORE_PASSWD", "sslcommerz.storePasswd");
  const sandbox = process.env.SSLCOMMERZ_SANDBOX !== "false";
  return { storeId, storePasswd, sandbox };
}

export const sslcommerz: PaymentProvider = {
  key: "sslcommerz",
  label: "Card / Mobile Banking (SSLCommerz)",

  async isConfigured() {
    const { storeId, storePasswd } = await keys();
    return !!storeId && !!storePasswd;
  },

  async initCheckout(input: InitCheckoutInput): Promise<InitCheckoutResult> {
    const { storeId, storePasswd, sandbox } = await keys();
    if (!storeId || !storePasswd) throw new Error("SSLCommerz not configured");

    const base = sandbox
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com";

    const form = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePasswd,
      total_amount: String(input.amount),
      currency: "USD",
      tran_id: input.tranId,
      success_url: `${input.appUrl}/api/deposits/gateway/callback?provider=sslcommerz&status=success`,
      fail_url: `${input.appUrl}/api/deposits/gateway/callback?provider=sslcommerz&status=fail`,
      cancel_url: `${input.appUrl}/api/deposits/gateway/callback?provider=sslcommerz&status=cancel`,
      ipn_url: `${input.appUrl}/api/deposits/gateway/callback?provider=sslcommerz`,
      cus_name: input.user.name ?? "User",
      cus_email: input.user.email ?? "user@example.com",
      cus_phone: "0000000000",
      shipping_method: "NO",
      product_name: "Wallet deposit",
      product_category: "deposit",
      product_profile: "general",
    });

    const res = await fetch(`${base}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = await res.json();
    if (data?.GatewayPageURL) {
      return { redirectUrl: data.GatewayPageURL, gatewayRef: input.tranId };
    }
    throw new Error(data?.failedreason || "Gateway init failed");
  },

  async verifyCallback(input: VerifyInput): Promise<VerifyResult> {
    const { params } = input;
    const gatewayRef = params.tran_id ?? "";
    // NEVER trust the client-supplied `status` — validate server-side against
    // SSLCommerz's validator API using the gateway-issued `val_id`. Without a
    // val_id (e.g. a forged/cancelled callback) the payment is not credited.
    const valId = params.val_id ?? params.value_a ?? "";
    if (!gatewayRef || !valId) {
      return { success: false, gatewayRef };
    }
    const { storeId, storePasswd, sandbox } = await keys();
    if (!storeId || !storePasswd) return { success: false, gatewayRef };
    const base = sandbox
      ? "https://sandbox.sslcommerz.com"
      : "https://securepay.sslcommerz.com";
    try {
      const q = new URLSearchParams({
        val_id: valId,
        store_id: storeId,
        store_passwd: storePasswd,
        format: "json",
      });
      const res = await fetch(
        `${base}/validator/api/validationserverAPI.php?${q.toString()}`,
        { method: "GET" }
      );
      const data = await res.json();
      const validated =
        (data?.status === "VALID" || data?.status === "VALIDATED") &&
        String(data?.tran_id ?? "") === gatewayRef;
      if (!validated) return { success: false, gatewayRef };
      return {
        success: true,
        gatewayRef,
        amount: Number(data?.amount ?? data?.currency_amount ?? NaN),
        currency: String(data?.currency ?? "USD"),
      };
    } catch {
      return { success: false, gatewayRef };
    }
  },
};
