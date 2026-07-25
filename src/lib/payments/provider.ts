/**
 * Payment provider abstraction for wallet deposits. Each provider knows how to
 * (a) start a hosted checkout for a given deposit and (b) verify the callback it
 * receives back, returning whether the payment succeeded. Providers degrade
 * gracefully: when their keys are unset `isConfigured()` is false and the deposit
 * flow falls back to the manual methods — nothing throws.
 */
export interface InitCheckoutInput {
  amount: number;
  /** Our local deposit id — used to build unique transaction references. */
  depositId: string;
  /** Pre-generated transaction id we store on the deposit as `gatewayRef`. */
  tranId: string;
  appUrl: string;
  user: { id: string; name?: string | null; email?: string | null };
}

export interface InitCheckoutResult {
  redirectUrl: string;
  /** The value to persist on the deposit as `gatewayRef` (may differ from tranId). */
  gatewayRef: string;
}

export interface VerifyInput {
  /** Merged query + form params from the callback request. */
  params: Record<string, string>;
}

export interface VerifyResult {
  success: boolean;
  /** The gatewayRef of the deposit this callback settles. */
  gatewayRef: string;
  /** Gateway-validated paid amount (in the deposit currency) — the callback
   *  route cross-checks this against the stored deposit amount before crediting. */
  amount?: number;
  /** Gateway-validated currency code (e.g. "USD"). */
  currency?: string;
}

export interface PaymentProvider {
  /** Stable key, e.g. "sslcommerz" | "bkash". Matches the `?provider=` param. */
  key: string;
  label: string;
  isConfigured(): Promise<boolean>;
  initCheckout(input: InitCheckoutInput): Promise<InitCheckoutResult>;
  verifyCallback(input: VerifyInput): Promise<VerifyResult>;
}
