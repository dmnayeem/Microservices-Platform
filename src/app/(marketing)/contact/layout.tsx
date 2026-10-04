import { OFFICIAL_SOCIAL_PROFILES } from "@/lib/seo/social-profiles";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY_NAME, SUPPORT_EMAIL } from "@/config/company";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://revtype.com";

// The page is a client component (the form), so its metadata lives here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Contact Us — Support, Payments and Partnerships",
    description: `Get help from the ${COMPANY_NAME} team: account and payout support, advertising and partnership enquiries. Email ${SUPPORT_EMAIL}.`,
    path: "/contact",
  });
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          url: `${SITE_URL}/contact`,
          about: {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: COMPANY_NAME,
            url: SITE_URL,
            sameAs: [...OFFICIAL_SOCIAL_PROFILES],
            contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, availableLanguage: ["English"] },
          },
        }}
      />
      {children}
    </>
  );
}
