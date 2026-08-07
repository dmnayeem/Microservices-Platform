import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalSection, LEGAL_CONTACT } from "@/components/legal/legal-ui";

export const metadata: Metadata = {
  title: "Privacy Policy · EarnGPT",
  description:
    "How EarnGPT collects, uses, shares, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <article>
      <LegalHeader
        title="Privacy Policy"
        intro="This Privacy Policy explains what information EarnGPT (“we”, “us”, the “Platform”) collects when you use our website and apps, how we use and share it, and the choices and rights you have. By using EarnGPT you agree to this Policy."
      />

      <LegalSection id="who" title="1. Who this applies to">
        <p>
          EarnGPT is intended only for users who are <strong>18 years or older</strong>.
          We do not knowingly collect information from anyone under 18. If you
          believe a minor has provided us information, contact us at{" "}
          <a className="text-indigo-400" href={`mailto:${LEGAL_CONTACT}`}>
            {LEGAL_CONTACT}
          </a>{" "}
          and we will remove it.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="2. Information we collect">
        <p>Depending on how you use EarnGPT, we may collect:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Account information</strong> — name, username, email, phone
            number, password (hashed), profile photo, date of birth, gender,
            country, and social handles you add.
          </li>
          <li>
            <strong>Identity verification (KYC)</strong> — when you request higher
            withdrawal limits or the verified badge, we collect government ID
            documents, a selfie, and related details. These are used only for
            identity verification and fraud prevention.
          </li>
          <li>
            <strong>Financial &amp; transaction data</strong> — your points/cash
            wallet balance, deposits, withdrawals, payout details (e.g. PayPal,
            bank, Wise, Payoneer, Skrill, or crypto wallet handles), earnings, and
            transaction history. We do <em>not</em> store full card numbers;
            card/gateway payments are handled by the payment provider.
          </li>
          <li>
            <strong>Activity &amp; content</strong> — tasks you complete and the
            proof you submit (links, screenshots, text), posts, comments, chats,
            group activity, courses, marketplace listings, referrals, and support
            messages.
          </li>
          <li>
            <strong>Device &amp; usage data</strong> — IP address, device/browser
            type, approximate location/country, log data, and cookies or similar
            technologies used to keep you signed in and to detect fraud.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="3. How we use your information">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Create and operate your account and wallet.</li>
          <li>
            Process tasks, rewards, deposits, withdrawals, subscriptions, and
            referrals.
          </li>
          <li>Verify identity (KYC) and prevent fraud, abuse, and money laundering.</li>
          <li>
            Send transactional and service messages (email, in-app, and push
            notifications you have enabled).
          </li>
          <li>Provide support, personalise content, and improve the Platform.</li>
          <li>Comply with legal obligations and enforce our Terms.</li>
        </ul>
      </LegalSection>

      <LegalSection id="share" title="4. How we share information">
        <p>
          We do not sell your personal information. We share it only as needed
          with:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Payment &amp; payout providers</strong> (e.g. PayPal, Stripe,
            and other regional processors) to move funds securely.
          </li>
          <li>
            <strong>Cloud &amp; infrastructure providers</strong> — Amazon Web
            Services (file/media storage), our database and hosting providers.
          </li>
          <li>
            <strong>Communication providers</strong> — email (SMTP) and web/push
            notification services.
          </li>
          <li>
            <strong>Authentication</strong> — Google (if you sign in with Google)
            and Firebase (if you verify a phone number).
          </li>
          <li>
            <strong>AI features</strong> — Google Gemini, to generate content you
            explicitly request (e.g. suggested review/comment text).
          </li>
          <li>
            <strong>Legal / safety</strong> — authorities when required by law, or
            to protect users, the public, or our rights.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="retention" title="5. Data retention">
        <p>
          We keep your information for as long as your account is active and as
          needed to provide the service. Transaction and KYC records may be kept
          longer where required by financial, tax, or anti-fraud laws. When you
          delete your account, we remove or anonymise your personal data except
          records we must retain by law.
        </p>
      </LegalSection>

      <LegalSection id="security" title="6. Security">
        <p>
          We use industry-standard measures — encrypted transport (HTTPS), hashed
          passwords, optional two-factor authentication (2FA), and access
          controls. No system is perfectly secure, so we cannot guarantee
          absolute security; please use a strong password and enable 2FA.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="7. Your rights &amp; choices">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Access &amp; correction</strong> — view and edit most profile
            data from your{" "}
            <Link className="text-indigo-400" href="/settings">
              account settings
            </Link>
            .
          </li>
          <li>
            <strong>Account deletion</strong> — you can permanently delete your
            account from Settings at any time; this removes your personal data
            subject to legal retention.
          </li>
          <li>
            <strong>Notifications</strong> — manage email and push preferences in
            Settings.
          </li>
          <li>
            <strong>Requests</strong> — email{" "}
            <a className="text-indigo-400" href={`mailto:${LEGAL_CONTACT}`}>
              {LEGAL_CONTACT}
            </a>{" "}
            to exercise any privacy right.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="8. Cookies">
        <p>
          We use essential cookies to keep you signed in and to protect against
          fraud. Disabling them may prevent parts of the Platform from working.
        </p>
      </LegalSection>

      <LegalSection id="transfers" title="9. International transfers">
        <p>
          Your information may be processed on servers located outside your
          country. We take steps to protect it consistent with this Policy
          wherever it is processed.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to this Policy">
        <p>
          We may update this Policy from time to time. Material changes will be
          notified in-app or by email. Continued use after changes means you
          accept the updated Policy.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact us">
        <p>
          Questions about privacy? Email{" "}
          <a className="text-indigo-400" href={`mailto:${LEGAL_CONTACT}`}>
            {LEGAL_CONTACT}
          </a>
          . See also our{" "}
          <Link className="text-indigo-400" href="/terms">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link className="text-indigo-400" href="/refund">
            Refund Policy
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  );
}
