import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalHeader,
  LegalSection,
  LEGAL_CONTACT,
  LEGAL_GOVERNING,
  LEGAL_ENTITY,
} from "@/components/legal/legal-ui";

export const metadata: Metadata = {
  title: "Terms of Service · EarnGPT",
  description:
    "The terms, end-user licence agreement, and community standards for using EarnGPT.",
};

export default function TermsPage() {
  return (
    <article>
      <LegalHeader
        title="Terms of Service"
        intro="These Terms (including the End-User Licence Agreement and Community Standards below) are a legal agreement between you and EarnGPT. By creating an account or using the Platform, you agree to them. If you do not agree, do not use EarnGPT."
      />

      <LegalSection id="eligibility" title="1. Eligibility">
        <p>
          You must be at least <strong>18 years old</strong> and legally able to
          enter a contract to use EarnGPT. Some features (such as prize draws or
          withdrawals) may be restricted or unavailable in certain countries; you
          are responsible for complying with your local laws.
        </p>
      </LegalSection>

      <LegalSection id="account" title="2. Your account">
        <p>
          You are responsible for your login credentials and all activity on your
          account. Provide accurate information, keep it up to date, and enable
          two-factor authentication where possible. One person may hold only one
          account; creating multiple or fake accounts to abuse rewards is
          prohibited and may result in forfeiture and a ban.
        </p>
      </LegalSection>

      <LegalSection id="earnings" title="3. Earnings are not guaranteed">
        <p>
          EarnGPT lets you earn points and rewards for completing activities.
          <strong>
            {" "}
            Any earnings figures, calculators, or projections shown are
            illustrative estimates only and are not a promise of income.
          </strong>{" "}
          Actual results depend on your activity, available tasks, your plan, and
          other factors, and may be zero. EarnGPT is not an investment, and
          participation should not be treated as a source of guaranteed income.
        </p>
      </LegalSection>

      <LegalSection id="wallet" title="4. Points, wallet, deposits &amp; withdrawals">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Points and rewards have no cash value except as expressly provided in
            the Platform, and may expire or be adjusted for errors, fraud, or
            reversed transactions.
          </li>
          <li>
            Deposits and withdrawals are processed through third-party providers.
            Fees, minimums, limits, and processing times may apply and are shown
            in-app. Withdrawals may require completed KYC verification.
          </li>
          <li>
            We may hold, review, reverse, or refuse a transaction we reasonably
            believe involves fraud, error, or a policy or legal violation.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="subscriptions" title="5. Packages &amp; subscriptions">
        <p>
          Paid packages/subscriptions unlock additional features. Where
          auto-renewal is enabled, your plan renews automatically for the same
          period and price until you cancel. You can cancel auto-renewal at any
          time from your account before the next renewal date. See our{" "}
          <Link className="text-indigo-400" href="/refund">
            Refund &amp; Cancellation Policy
          </Link>{" "}
          for details.
        </p>
      </LegalSection>

      <LegalSection id="referrals" title="6. Referral program">
        <p>
          You may earn referral rewards for inviting others in line with the rules
          shown in-app. Referral rewards are funded by EarnGPT and are for genuine
          referrals only. Self-referrals, fake accounts, spam, purchased traffic,
          or any manipulation of the referral system are prohibited and may lead
          to reversal of rewards and account suspension.
        </p>
      </LegalSection>

      {/* ── EULA / Community Standards (Apple 1.2 requirement) ─────────────── */}
      <LegalSection
        id="community"
        title="7. User content &amp; community standards (EULA)"
      >
        <p>
          EarnGPT includes social features where users can post content and
          interact. You are solely responsible for what you post. By posting, you
          grant EarnGPT a licence to host and display your content within the
          Platform.
        </p>
        <p className="font-semibold text-white">
          There is zero tolerance for objectionable content or abusive behaviour.
        </p>
        <p>The following are strictly prohibited:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Harassment, bullying, threats, hate speech, or attacks on any person
            or group.
          </li>
          <li>
            Sexual, violent, illegal, or otherwise objectionable content; spam,
            scams, or misleading claims.
          </li>
          <li>
            Impersonation, doxxing, sharing others’ private data, or infringing
            intellectual property.
          </li>
          <li>Anything unlawful or that harms other users or the Platform.</li>
        </ul>
        <p>
          You can <strong>report</strong> any content and <strong>block</strong>{" "}
          any user from within the app. We review reported content and take
          action — including removing content and suspending or banning abusive
          users — <strong>within 24 hours</strong>. We may remove content or
          terminate accounts at our discretion to keep the community safe.
        </p>
      </LegalSection>

      <LegalSection id="prohibited" title="8. Prohibited use">
        <p>
          You agree not to misuse the Platform, including: using bots/automation,
          VPN/proxy fraud, multiple accounts, fake proof, exploiting bugs,
          reverse-engineering, scraping, or interfering with security or other
          users. Violations may result in loss of points/balance and account
          termination.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="9. Intellectual property">
        <p>
          EarnGPT and its logos, software, and content (excluding user content)
          are owned by us or our licensors and may not be copied or used without
          permission.
        </p>
      </LegalSection>

      <LegalSection id="disclaimer" title="10. Disclaimers &amp; liability">
        <p>
          The Platform is provided “as is” without warranties of any kind. To the
          maximum extent permitted by law, EarnGPT is not liable for indirect or
          consequential losses, lost earnings, or issues caused by third-party
          providers. Nothing limits liability that cannot be excluded by law.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="11. Suspension &amp; termination">
        <p>
          We may suspend or terminate your account for breach of these Terms,
          suspected fraud, or legal reasons. You may stop using EarnGPT and delete
          your account at any time from Settings.
        </p>
      </LegalSection>

      <LegalSection id="law" title="12. Governing law &amp; changes">
        <p>
          EarnGPT is a global service operated by {LEGAL_ENTITY}. These Terms are
          governed by {LEGAL_GOVERNING}. Nothing here removes rights you cannot
          waive under the laws of your country of residence.
        </p>
        <p>
          We may update these Terms from time to time; material changes will be
          notified in-app or by email, and continued use means you accept them.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="13. Contact">
        <p>
          Questions? Email{" "}
          <a className="text-indigo-400" href={`mailto:${LEGAL_CONTACT}`}>
            {LEGAL_CONTACT}
          </a>
          . See also our{" "}
          <Link className="text-indigo-400" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  );
}
