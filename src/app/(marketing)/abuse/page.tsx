import type { Metadata } from "next";
import { ShieldAlert, Mail, FileWarning, Clock } from "lucide-react";
import { pageMeta } from "@/lib/seo/page-meta";
import { COMPANY_NAME } from "@/config/company";
import { getAbuseSettings } from "@/lib/abuse/settings";
import { AbuseReportForm } from "@/components/marketing/abuse-report-form";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Report Abuse or Copyright Infringement",
    description: `How to report malware, phishing, spam, fraud or copyright infringement on ${COMPANY_NAME}, and what happens next.`,
    path: "/abuse",
  });
}

export default async function AbusePage() {
  const { email } = await getAbuseSettings();
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:px-8">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b)">
          <ShieldAlert className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-(--mk-text) sm:text-5xl">Report abuse</h1>
        <p className="mx-auto mt-4 max-w-2xl text-(--mk-muted)">
          Malware, phishing, spam, fraud, illegal content or copyright infringement on {COMPANY_NAME} — tell us and we act
          on it. Hosting providers, networks and rights holders are welcome to use this page.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4 text-sm text-(--mk-muted)">
          <div className="mk-card rounded-2xl p-4">
            <p className="flex items-center gap-2 font-bold text-(--mk-text)">
              <Mail className="h-4 w-4" /> Abuse contact
            </p>
            <p className="mt-1">
              <a href={`mailto:${email}`} className="text-blue-500 hover:underline">
                {email}
              </a>
            </p>
            <p className="mt-1">Include the exact URLs, what is wrong, and any ticket number of yours.</p>
          </div>
          <div className="mk-card rounded-2xl p-4">
            <p className="flex items-center gap-2 font-bold text-(--mk-text)">
              <FileWarning className="h-4 w-4" /> Copyright notices (DMCA-style)
            </p>
            <p className="mt-1">A notice must include:</p>
            <ol className="ml-5 mt-1 list-decimal space-y-1">
              <li>the copyrighted work you say is infringed;</li>
              <li>the URL(s) on our site of the infringing material;</li>
              <li>your name, address or organisation, and email;</li>
              <li>a statement that you believe in good faith the use is not authorised by the owner, its agent or the law;</li>
              <li>a statement that the notice is accurate and that you are the owner or authorised to act for the owner;</li>
              <li>your physical or electronic signature (typing your full name counts).</li>
            </ol>
          </div>
          <div className="mk-card rounded-2xl p-4">
            <p className="flex items-center gap-2 font-bold text-(--mk-text)">
              <Clock className="h-4 w-4" /> What happens next
            </p>
            <p className="mt-1">
              Every report opens a case our team reviews. Harmful content is hidden (not deleted) while we look, logs are
              preserved, and we reply to the address you give with what we found and did.
            </p>
          </div>
        </div>

        <AbuseReportForm />
      </div>
    </div>
  );
}
