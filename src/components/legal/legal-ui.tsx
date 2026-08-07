import type { ReactNode } from "react";
import { SUPPORT_EMAIL, COMPANY_LEGAL } from "@/config/company";

/** Last time any legal document was revised. Update when policies change. */
export const LEGAL_UPDATED = "9 July 2026";
export const LEGAL_CONTACT = SUPPORT_EMAIL;
/** Operating entity named in the legal documents. */
export const LEGAL_ENTITY = COMPANY_LEGAL;
/**
 * Governing-law framing. Neutral/international rather than a single country: the
 * service is offered globally, disputes are handled by binding arbitration under
 * internationally recognized rules, and users keep the mandatory consumer-law
 * protections of their country of residence.
 */
export const LEGAL_GOVERNING =
  "the laws applicable to international online services, with any disputes " +
  "resolved by binding arbitration under internationally recognized rules — " +
  "while the mandatory consumer-protection laws of your country of residence " +
  "still apply to you";

/** Page title + "last updated" header for a legal document. */
export function LegalHeader({
  title,
  intro,
}: {
  title: string;
  intro?: string;
}) {
  return (
    <div className="mb-10">
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        {title}
      </h1>
      <p className="text-xs text-slate-500 mt-2">Last updated: {LEGAL_UPDATED}</p>
      {intro && (
        <p className="text-sm sm:text-base text-slate-400 mt-4 leading-relaxed">
          {intro}
        </p>
      )}
    </div>
  );
}

/** A section with an anchor id for a legal document. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-20">
      <h2 className="text-lg sm:text-xl font-bold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm sm:text-[15px] leading-relaxed text-slate-300/90">
        {children}
      </div>
    </section>
  );
}
