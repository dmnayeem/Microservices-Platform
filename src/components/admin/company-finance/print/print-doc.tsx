import { getSellerConfig, getTaxConfig } from "@/lib/invoices";
import { getPlatformName } from "@/lib/system-settings";
import { PrintButton } from "./print-button";

/**
 * The frame every printed finance document shares: letterhead, title, a row of
 * reference details, the body, signature lines and a printed-by footer.
 *
 * Printing hides EVERYTHING except `.print-doc` — the admin sidebar, the header,
 * and the pop-ups the root layout can open on any page (splash, cookie banner,
 * ad interstitial). Hiding by allow-list rather than by naming each unwanted
 * element is what keeps a new overlay added next month off the salary sheet.
 */
export async function PrintDoc({
  title,
  subtitle,
  meta,
  signatures = ["Prepared by", "Checked by", "Approved by"],
  printedBy,
  landscape,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  signatures?: string[];
  printedBy?: string | null;
  landscape?: boolean;
  children: React.ReactNode;
}) {
  const [seller, tax, platform] = await Promise.all([getSellerConfig(), getTaxConfig(), getPlatformName()]);
  const name = seller.name.trim() || platform;

  return (
    <div className="print-root">
      <style>{`
        @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          .print-doc, .print-doc * { visibility: visible !important; }
          .print-doc { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
        }
        .print-doc { font-family: "Segoe UI", Arial, sans-serif; color: #111827; }
        /* Literal ink. This app's theme system REMAPS Tailwind's grays per
           theme (the darkest gray becomes white in light mode), so a document that
           used those classes printed white text on white paper for anyone on
           the light theme. Paper is always white; its ink is always these. */
        .print-doc .pd-ink { color: #111827; }
        .print-doc .pd-soft { color: #374151; }
        .print-doc .pd-muted2 { color: #4b5563; }
        .print-doc .pd-muted { color: #6b7280; }
        .print-doc .pd-faint { color: #9ca3af; }
        .print-doc .pd-danger { color: #b91c1c; }
        .print-doc .pd-rule-strong { border-color: #1f2937; }
        .print-doc .pd-rule { border-color: #374151; }
        .print-doc .pd-rule-faint { border-color: #e5e7eb; }
        .print-doc table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .print-doc th, .print-doc td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
        .print-doc th { background: #f3f4f6; text-align: left; font-weight: 600; }
        .print-doc .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .print-doc tr { break-inside: avoid; }
      `}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">Preview — only the white page is printed.</p>
        <PrintButton />
      </div>

      <div
        className="print-doc mx-auto rounded-lg p-8 shadow-xl"
        style={{ maxWidth: landscape ? "1100px" : "820px", background: "#ffffff", color: "#111827" }}
      >
        {/* Letterhead */}
        <div className="flex items-start justify-between gap-6 border-b-2 pd-rule-strong pb-3">
          <div>
            <p className="text-xl font-bold tracking-tight">{name}</p>
            {seller.addressLines.map((l) => (
              <p key={l} className="text-xs pd-muted2">{l}</p>
            ))}
            <p className="text-xs pd-muted2">
              {[seller.phone, seller.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right text-xs pd-muted2">
            {tax.taxId && <p>BIN / VAT reg.: <span className="font-semibold pd-ink">{tax.taxId}</span></p>}
            <p>Printed {new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-lg font-bold uppercase tracking-wide">{title}</p>
          {subtitle && <p className="text-sm pd-muted2">{subtitle}</p>}
        </div>

        {meta && meta.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
            {meta.map((m) => (
              <p key={m.label}>
                <span className="pd-muted">{m.label}:</span> <span className="font-medium">{m.value || "—"}</span>
              </p>
            ))}
          </div>
        )}

        <div className="mt-5">{children}</div>

        {signatures.length > 0 && (
          <div className="mt-16 grid gap-8" style={{ gridTemplateColumns: `repeat(${signatures.length}, 1fr)` }}>
            {signatures.map((s) => (
              <div key={s} className="border-t pd-rule pt-1 text-center text-xs pd-soft">{s}</div>
            ))}
          </div>
        )}

        <p className="mt-8 border-t pd-rule-faint pt-2 text-center text-[10px] pd-faint">
          {name} — generated from the company books{printedBy ? ` by ${printedBy}` : ""}. This is a computer-generated document.
        </p>
      </div>
    </div>
  );
}

/** Money on paper: currency code or symbol, thousands separated, two decimals. */
export function paperMoney(amount: number, currency: string): string {
  const sym = currency === "BDT" ? "৳" : currency === "USD" ? "$" : `${currency} `;
  const n = Number.isFinite(amount) ? amount : 0;
  // Taka is grouped the South Asian way on paper too: 12,50,000, not 1,250,000.
  const locale = currency === "BDT" || currency === "INR" ? "en-IN" : "en-US";
  return `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
