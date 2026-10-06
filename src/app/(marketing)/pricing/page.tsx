import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { Packages } from "@/components/landing";
import { Section, PrimaryButton, GhostButton } from "@/components/marketing/ui";
import { getLandingContent } from "@/lib/landing-content-server";
import { publicLanding } from "@/lib/landing-content";
import { getPlansForDisplay } from "@/lib/plans-display";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

/**
 * Public pricing page — the live membership packages, read-only.
 *
 * The plans come from the same cached loader as /packages and the landing
 * page (lib/plans-display: active packages only, under PACKAGES_TAG), so the
 * three can never quote different prices. Nothing is bought here: every call
 * to action goes to /register or /login, and a signed-in member buys from
 * /packages inside the app.
 */
export function generateMetadata(): Promise<Metadata> {
  const title = "Pricing — Membership Packages and What Each Includes";
  const description =
    // ≤155 chars — what Google shows uncut.
    `Joining ${COMPANY_NAME} is free. Compare the membership packages, their prices and what each one unlocks before you sign up.`;
  return pageMeta({ title, description, path: "/pricing" });
}

export default async function PricingPage() {
  const [content, plans] = await Promise.all([
    getLandingContent().then(publicLanding),
    getPlansForDisplay().catch(() => ({ plans: [], rows: [] })),
  ]);

  return (
    <>
      <Packages {...content.packages} livePlans={plans.plans} />
      <Section width="narrow" className="text-center">
        <p className="text-(--mk-muted)">
          Every package is chosen after you sign up — creating an account costs nothing.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryButton href="/register">
            <UserPlus className="h-4 w-4" /> Create free account
          </PrimaryButton>
          <GhostButton href="/login">Already a member? Log in →</GhostButton>
        </div>
      </Section>
    </>
  );
}
