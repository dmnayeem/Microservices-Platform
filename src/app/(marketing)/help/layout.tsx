import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY_NAME } from "@/config/company";
import { HELP_CATEGORIES } from "./help-articles";

// The page is a client component (search + accordion), so its metadata and
// structured data live here.
export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Help Center — Earning, Tasks and Withdrawals",
    description: `How ${COMPANY_NAME} works: creating an account, earning from tasks, withdrawals and payments, and keeping your account secure.`,
    path: "/help",
  });
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* FAQPage — lets search results and AI answers quote these directly (AEO). */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HELP_CATEGORIES.flatMap((c) =>
            c.articles.map((a) => ({
              "@type": "Question",
              name: a.q,
              acceptedAnswer: { "@type": "Answer", text: a.a },
            }))
          ),
        }}
      />
      {children}
    </>
  );
}
