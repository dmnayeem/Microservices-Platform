"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Lock, Save, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { parseCustomCode } from "@/lib/custom-code";

type Values = Record<string, string | boolean>;

const inp =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-60";

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function SeoSettingsForm({
  initial,
  canEdit,
  isSuper,
  adsenseClient,
  siteUrl,
}: {
  initial: Values;
  canEdit: boolean;
  isSuper: boolean;
  adsenseClient: string;
  siteUrl: string;
}) {
  const [v, setV] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);
  const str = (k: string) => String(v[k] ?? "");
  const set = (k: string, val: string | boolean) => setV((p) => ({ ...p, [k]: val }));

  const text = (k: string, placeholder = "", opts: { super?: boolean } = {}) => (
    <input
      value={str(k)}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      disabled={!canEdit || (opts.super && !isSuper)}
      className={inp}
    />
  );

  const title = str("seo.default_title") || str("seo.site_name");
  const desc = str("seo.description");
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const headCode = useMemo(() => parseCustomCode(str("code.head")), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyCode = useMemo(() => parseCustomCode(str("code.body")), [v]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: v }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save");
      toast.success("SEO & tracking saved", { description: "Live on the site within a minute." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const tracking = [
    { k: "tracking.ga4_id", label: "Google Analytics 4 — Measurement ID", ph: "G-XXXXXXXXXX", where: "Analytics → Admin → Data streams → your web stream" },
    { k: "tracking.gtm_id", label: "Google Tag Manager — Container ID", ph: "GTM-XXXXXXX", where: "Tag Manager → the ID next to your container name" },
    { k: "tracking.google_ads_id", label: "Google Ads — Conversion ID", ph: "AW-1234567890", where: "Google Ads → Tools → Conversions → Tag setup (the AW- ID)" },
    { k: "tracking.fb_pixel_id", label: "Facebook / Meta Pixel ID", ph: "123456789012345", where: "Meta Events Manager → Data sources → your pixel" },
    { k: "tracking.pinterest_tag_id", label: "Pinterest Tag ID", ph: "2612345678901", where: "Pinterest Ads → Conversions → Tag manager" },
    { k: "tracking.tiktok_pixel_id", label: "TikTok Pixel ID", ph: "C1ABCDEFGHIJKLMNOPQR", where: "TikTok Ads → Assets → Events → Web events" },
  ];
  const verify = [
    { k: "seo.verify_google", label: "Google Search Console", where: "Search Console → add property → HTML tag" },
    { k: "seo.verify_bing", label: "Bing Webmaster Tools", where: "Bing Webmaster → add site → HTML meta tag" },
    { k: "seo.verify_facebook", label: "Facebook domain verification", where: "Meta Business → Brand safety → Domains" },
    { k: "seo.verify_pinterest", label: "Pinterest site claim", where: "Pinterest → Settings → Claimed accounts → HTML tag" },
    { k: "seo.verify_yandex", label: "Yandex Webmaster", where: "Yandex Webmaster → add site → meta tag" },
  ];

  return (
    <div className="space-y-4 pb-24">
      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          View only — saving needs the settings edit permission.
        </div>
      )}

      <Section title="Brand" hint="The name and images the site uses everywhere — browser tab, home-screen icon, search results.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Site name">{text("seo.site_name", "EarnGPT")}</Row>
          <div />
          <Row label="Logo" hint="Square, at least 512×512. Used by Google next to your name.">
            <ImageUploadField value={str("seo.logo_url")} onChange={(u) => set("seo.logo_url", u)} title="Logo" previewSize="square" />
          </Row>
          <Row label="Favicon" hint="The small icon in the browser tab. Square PNG, 192×192 or larger.">
            <ImageUploadField value={str("seo.favicon_url")} onChange={(u) => set("seo.favicon_url", u)} title="Favicon" previewSize="square" />
          </Row>
          <Row label="Apple / home-screen icon" hint="180×180 PNG, no transparency.">
            <ImageUploadField value={str("seo.apple_icon_url")} onChange={(u) => set("seo.apple_icon_url", u)} title="Apple touch icon" previewSize="square" />
          </Row>
        </div>
      </Section>

      <Section title="Search appearance" hint="What Google shows for the site, and the card Facebook, WhatsApp and X show when a link is shared.">
        <Row label="Title" hint={`${title.length}/60 — keep it under 60 so Google does not cut it.`}>{text("seo.default_title")}</Row>
        <Row label="Title template for inner pages" hint='%s is replaced by the page name, e.g. "Wallet | EarnGPT".'>{text("seo.title_template", "%s | EarnGPT")}</Row>
        <Row label="Description" hint={`${desc.length}/160 — Google shows about 155–160 characters.`}>
          <textarea rows={3} value={desc} onChange={(e) => set("seo.description", e.target.value)} disabled={!canEdit} className={inp} />
        </Row>
        <Row label="Keywords" hint="Comma-separated. Minor for Google today; some other engines still read them.">
          <textarea rows={2} value={str("seo.keywords")} onChange={(e) => set("seo.keywords", e.target.value)} disabled={!canEdit} className={inp} />
        </Row>
        <div className="rounded-lg border border-slate-800 bg-white p-3">
          <p className="text-xs text-[#4d5156]">{host}</p>
          <p className="truncate text-lg text-[#1a0dab]">{title || "—"}</p>
          <p className="line-clamp-2 text-sm text-[#4d5156]">{desc || "—"}</p>
          <p className="mt-1 text-[10px] text-slate-400">Google result preview</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Share image (Open Graph)" hint="1200×630. Shown when a link to the site is shared.">
            <ImageUploadField value={str("seo.og_image_url")} onChange={(u) => set("seo.og_image_url", u)} title="Share image" previewSize="lg" />
          </Row>
          <Row label="X (Twitter) handle" hint="Without the @, e.g. earngpt.">{text("seo.twitter_handle", "earngpt")}</Row>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200">
          <input type="checkbox" checked={v["seo.indexing"] !== false} onChange={(e) => set("seo.indexing", e.target.checked)} disabled={!canEdit} className="mt-0.5" />
          <span>
            <b>Allow search engines to index the site</b>
            <span className="block text-xs text-slate-400">
              Off = every page says &quot;noindex&quot; and robots.txt blocks crawlers. Use only while setting up — leaving it off
              removes the site from Google.
            </span>
          </span>
        </label>
      </Section>

      <Section title="Verification" hint="Prove to each service that you own the site. Paste just the code — or the whole <meta …> tag, the code is taken out of it.">
        <div className="grid gap-4 sm:grid-cols-2">
          {verify.map((f) => (
            <Row key={f.k} label={f.label} hint={f.where}>
              {text(f.k, "content value")}
            </Row>
          ))}
        </div>
      </Section>

      <Section
        title="Google Knowledge Panel"
        hint="The box Google can show for your brand. Google decides whether to show it; what you can do is describe the organisation clearly and link every official profile, so Google can be sure they are all the same brand."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Type">
            <select value={str("seo.org_type")} onChange={(e) => set("seo.org_type", e.target.value)} disabled={!canEdit} className={inp}>
              <option value="Organization">Organization</option>
              <option value="Corporation">Corporation (registered company)</option>
              <option value="OnlineBusiness">Online business</option>
              <option value="LocalBusiness">Local business (has an office people visit)</option>
            </select>
          </Row>
          <Row label="Legal name" hint="As registered, if different from the site name.">{text("seo.org_legal_name")}</Row>
          <Row label="Founded" hint="YYYY or YYYY-MM-DD.">{text("seo.org_founding_date", "2025")}</Row>
          <Row label="Support email">{text("seo.org_email", "support@…")}</Row>
          <Row label="Support phone" hint="With country code, e.g. +8801…">{text("seo.org_phone")}</Row>
          <Row label="Country" hint="2-letter code, e.g. BD.">{text("seo.org_country", "BD")}</Row>
        </div>
        <Row label="Address">{text("seo.org_address")}</Row>
        <Row label="About the organisation">
          <textarea rows={2} value={str("seo.org_description")} onChange={(e) => set("seo.org_description", e.target.value)} disabled={!canEdit} className={inp} />
        </Row>
        <Row
          label="Official profiles (one per line)"
          hint="Facebook page, YouTube, X, Instagram, LinkedIn, TikTok, Pinterest, Wikipedia / Wikidata — full https:// links. This list (sameAs) is the most important part."
        >
          <textarea rows={5} value={str("seo.org_same_as")} onChange={(e) => set("seo.org_same_as", e.target.value)} disabled={!canEdit} className={`${inp} font-mono text-xs`} placeholder={"https://www.facebook.com/…\nhttps://www.youtube.com/@…"} />
        </Row>
        <ul className="space-y-1 text-xs text-slate-400">
          <li>1. Verify the site in Google Search Console (Verification above).</li>
          <li>2. Use exactly the same name and logo on the site and every profile.</li>
          <li>3. Link back to the site from each profile&apos;s bio.</li>
          <li>4. Once a panel appears, claim it from Google Search (&quot;Claim this knowledge panel&quot;).</li>
        </ul>
      </Section>

      <Section
        title="Analytics & pixels"
        hint="Paste just the ID — the code is added for you. With the cookie banner on, analytics tags wait for the visitor's consent to analytics, ad pixels for consent to marketing."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {tracking.map((f) => (
            <Row key={f.k} label={f.label} hint={f.where}>
              {text(f.k, f.ph)}
            </Row>
          ))}
        </div>
        <Row label="Load on">
          <select value={str("tracking.scope")} onChange={(e) => set("tracking.scope", e.target.value)} disabled={!canEdit} className={inp}>
            <option value="all">Every page (except the admin panel)</option>
            <option value="public">Public pages only (landing, marketing, sign-up)</option>
          </select>
        </Row>
      </Section>

      <Section title="Google AdSense" hint="AdSense has its own settings, with the placement rules that keep the account safe.">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm">
          {adsenseClient ? (
            <span className="inline-flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Connected: <span className="font-mono">{adsenseClient}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-4 w-4" /> No AdSense publisher ID set
            </span>
          )}
          <Link href="/admin/monetization" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
            Open Monetization (publisher ID &amp; ads.txt) <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Section>

      <Section
        title="Custom code"
        hint={
          <>
            For anything without a field above (another pixel, a chat widget, a verification tag). Only
            &lt;script&gt;, &lt;meta&gt;, &lt;link&gt;, &lt;style&gt; and &lt;noscript&gt; tags are used; scripts wait for
            marketing consent.{" "}
            {!isSuper && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Lock className="h-3 w-3" /> Only the super admin can change it — code here runs on every visitor&apos;s page.
              </span>
            )}
          </>
        }
      >
        <Row label="Head code" hint={`${headCode.tags.length} tag(s) will be used${headCode.ignored ? `, ${headCode.ignored} other element(s) ignored` : ""}.`}>
          <textarea rows={6} value={str("code.head")} onChange={(e) => set("code.head", e.target.value)} disabled={!canEdit || !isSuper} className={`${inp} font-mono text-xs`} placeholder={'<meta name="…" content="…" />\n<script src="https://…"></script>'} />
        </Row>
        <Row label="Body code (end of page)" hint={`${bodyCode.tags.length} tag(s) will be used${bodyCode.ignored ? `, ${bodyCode.ignored} other element(s) ignored` : ""}.`}>
          <textarea rows={5} value={str("code.body")} onChange={(e) => set("code.body", e.target.value)} disabled={!canEdit || !isSuper} className={`${inp} font-mono text-xs`} />
        </Row>
        <Row label="Load custom code on">
          <select value={str("code.scope")} onChange={(e) => set("code.scope", e.target.value)} disabled={!canEdit || !isSuper} className={inp}>
            <option value="public">Public pages only (recommended)</option>
            <option value="all">Every page (except the admin panel)</option>
          </select>
        </Row>
      </Section>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:pl-72">
          <div className="mx-auto flex max-w-4xl justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save SEO &amp; tracking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
