import type { Metadata } from "next";
import { LegalHeader, LegalSection, LEGAL_CONTACT, LEGAL_ENTITY } from "@/components/legal/legal-ui";

export const metadata: Metadata = {
  title: "Cookie Policy · EarnGPT",
  description: "How EarnGPT uses cookies and similar technologies, and how you can control them.",
};

export default function CookiePolicyPage() {
  return (
    <article>
      <LegalHeader
        title="Cookie Policy"
        intro={`This Cookie Policy explains how ${LEGAL_ENTITY} ("EarnGPT", "we") uses cookies and similar technologies when you visit our website and app. It should be read together with our Privacy Policy.`}
      />

      <LegalSection id="what" title="1. What are cookies?">
        <p>
          Cookies are small text files stored on your device when you visit a
          website. Similar technologies include local storage, pixels, and SDKs.
          They help websites work, remember your preferences, keep you signed in,
          and understand how the service is used.
        </p>
      </LegalSection>

      <LegalSection id="types" title="2. Types of cookies we use">
        <p><strong>Essential</strong> — required for the platform to function: signing in, keeping your session secure, load balancing, and fraud prevention. These can&apos;t be switched off.</p>
        <p><strong>Preferences</strong> — remember choices like language, theme, and layout so your experience is consistent.</p>
        <p><strong>Analytics</strong> — help us understand which features are used and where to improve, in aggregate.</p>
        <p><strong>Marketing / attribution</strong> — measure the performance of campaigns and referrals (for example, which link brought you here) so rewards are credited correctly.</p>
      </LegalSection>

      <LegalSection id="third-parties" title="3. Third-party cookies">
        <p>
          Some cookies are set by trusted third parties that provide services on
          our behalf — for example authentication, payment processing, analytics,
          and offer/survey partners. Their use of cookies is governed by their own
          policies.
        </p>
      </LegalSection>

      <LegalSection id="consent" title="4. Your consent & choices">
        <p>
          When required by law (for example in the EEA/UK), we ask for your consent
          to non-essential cookies through our cookie banner, and you can change
          your choice at any time. You can also control cookies through your browser
          settings — blocking some may affect how the platform works.
        </p>
      </LegalSection>

      <LegalSection id="manage" title="5. Managing cookies in your browser">
        <p>
          Most browsers let you view, delete, and block cookies from their settings
          or privacy menu. Search your browser&apos;s help for &ldquo;cookies&rdquo;
          to find the exact steps for your device.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="6. Changes & contact">
        <p>
          We may update this policy as our services or the law change. Questions
          about cookies? Email{" "}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-blue-400 hover:underline">{LEGAL_CONTACT}</a>.
        </p>
      </LegalSection>
    </article>
  );
}
