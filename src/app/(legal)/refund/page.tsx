import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalSection, LEGAL_CONTACT } from "@/components/legal/legal-ui";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · EarnGPT",
  description:
    "How refunds, subscription cancellations, and disputes are handled on EarnGPT.",
};

export default function RefundPolicyPage() {
  return (
    <article>
      <LegalHeader
        title="Refund &amp; Cancellation Policy"
        intro="This policy explains when payments on EarnGPT can be refunded or cancelled. It forms part of, and should be read together with, our Terms of Service."
      />

      <LegalSection id="deposits" title="1. Wallet deposits">
        <p>
          Money you add to your EarnGPT wallet is credited to your balance for use
          on the Platform. Because deposited funds can be spent immediately (for
          example on packages or fees), deposits are generally{" "}
          <strong>non-refundable</strong> once credited. If a deposit failed,
          was duplicated, or was charged in error, contact us and we will
          investigate and correct verified errors.
        </p>
      </LegalSection>

      <LegalSection id="subscriptions" title="2. Packages &amp; subscriptions">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Paid packages/subscriptions grant access to digital features
            immediately, so they are generally non-refundable once the period has
            started, except where required by law.
          </li>
          <li>
            <strong>Auto-renewal</strong> can be cancelled at any time from your
            account before the next renewal date. Cancelling stops future charges;
            you keep access until the current period ends.
          </li>
          <li>
            Purchases made through the Apple App Store or Google Play are subject
            to that store’s refund process; request those refunds through the
            store.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="points" title="3. Points &amp; earned rewards">
        <p>
          Points, bonuses, and earned rewards have no cash value except as
          expressly provided in the Platform and are <strong>not refundable</strong>{" "}
          or exchangeable for money outside the Platform’s withdrawal features.
          Rewards granted in error, or through fraud or abuse, may be reversed.
        </p>
      </LegalSection>

      <LegalSection id="withdrawals" title="4. Withdrawals">
        <p>
          Withdrawal requests are processed to your chosen payout method after any
          required verification. A withdrawal cannot be “refunded” once paid out.
          If a withdrawal fails at the provider, the amount is returned to your
          wallet so you can try again.
        </p>
      </LegalSection>

      <LegalSection id="how" title="5. How to request a refund or report an issue">
        <p>
          Email{" "}
          <a className="text-(--mk-accent)" href={`mailto:${LEGAL_CONTACT}`}>
            {LEGAL_CONTACT}
          </a>{" "}
          with your account email, the transaction reference, the date, and a
          description of the issue. We aim to respond within a few business days
          and to resolve verified payment errors promptly.
        </p>
      </LegalSection>

      <LegalSection id="chargebacks" title="6. Chargebacks">
        <p>
          If you believe a charge is wrong, please contact us first — most issues
          are resolved quickly. Initiating a chargeback without contacting us may
          lead to your account being suspended pending review.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="7. Contact">
        <p>
          Need help? Email{" "}
          <a className="text-(--mk-accent)" href={`mailto:${LEGAL_CONTACT}`}>
            {LEGAL_CONTACT}
          </a>
          . See also our{" "}
          <Link className="text-(--mk-accent)" href="/terms">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link className="text-(--mk-accent)" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  );
}
