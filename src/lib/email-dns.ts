import "server-only";
import { Resolver } from "node:dns/promises";

/**
 * Deliverability check for the From domain: SPF, DKIM, DMARC and MX, read
 * straight from public DNS, plus what the SMTP host says about the provider.
 *
 * None of this can be fixed in code — it is DNS the owner adds at the domain
 * registrar — so every result carries the plain-language fix and, where the
 * provider is known, the exact record to paste.
 */

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type DnsCheck = {
  id: "provider" | "spf" | "dkim" | "dmarc" | "mx";
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to add, when something is missing. */
  fix?: { type: "TXT" | "CNAME" | "MX"; host: string; value: string; note?: string }[];
};

export type Provider = {
  id: string;
  name: string;
  /** The SPF mechanism this provider needs. */
  spfInclude: string | null;
  /** DKIM selectors this provider uses by default, if fixed. */
  dkimSelectors: string[];
  dkimHelp: string;
  consumer?: boolean;
};

const PROVIDERS: Array<Provider & { match: RegExp }> = [
  { id: "google", name: "Google Workspace", match: /(^|\.)(gmail|googlemail|google)\.com$/i, spfInclude: "include:_spf.google.com", dkimSelectors: ["google"], dkimHelp: "Google Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate new record, then add it as TXT at google._domainkey." },
  { id: "hostinger", name: "Hostinger Email", match: /hostinger\.com$/i, spfInclude: "include:_spf.mail.hostinger.com", dkimSelectors: ["hostingermail-a", "hostingermail-b", "hostingermail-c", "hostingermail1"], dkimHelp: "hPanel → Emails → your domain → DNS / Connect domain shows the three hostingermail DKIM CNAME records." },
  { id: "resend", name: "Resend", match: /resend\.(com|dev)$/i, spfInclude: "include:amazonses.com", dkimSelectors: ["resend"], dkimHelp: "Resend dashboard → Domains → your domain lists the resend._domainkey TXT record (SPF goes on the send. subdomain)." },
  { id: "ses", name: "Amazon SES", match: /amazonaws\.com$/i, spfInclude: "include:amazonses.com", dkimSelectors: [], dkimHelp: "SES → Verified identities → your domain → DKIM: add the three CNAME records it shows (random selectors, so they can't be checked from here)." },
  { id: "zoho", name: "Zoho Mail", match: /zoho(mail)?\.(com|eu|in)$/i, spfInclude: "include:zoho.com", dkimSelectors: ["zmail", "zoho", "default"], dkimHelp: "Zoho Mail Admin → Domains → Email configuration → DKIM: add a selector and paste its TXT record." },
  { id: "brevo", name: "Brevo (Sendinblue)", match: /(brevo|sendinblue)\.com$/i, spfInclude: "include:spf.brevo.com", dkimSelectors: ["mail", "brevo1", "brevo2"], dkimHelp: "Brevo → Senders, domains & IPs → Domains → Authenticate shows the DKIM record." },
  { id: "sendgrid", name: "SendGrid", match: /sendgrid\.net$/i, spfInclude: "include:sendgrid.net", dkimSelectors: ["s1", "s2"], dkimHelp: "SendGrid → Settings → Sender Authentication → Authenticate your domain gives s1/s2 CNAME records." },
  { id: "mailgun", name: "Mailgun", match: /mailgun\.org$/i, spfInclude: "include:mailgun.org", dkimSelectors: ["mx", "k1", "smtp", "pic"], dkimHelp: "Mailgun → Sending → Domains → DNS records lists the DKIM TXT record." },
  { id: "postmark", name: "Postmark", match: /(postmarkapp\.com|mtasv\.net)$/i, spfInclude: "include:spf.mtasv.net", dkimSelectors: [], dkimHelp: "Postmark → Sender signatures → DNS settings shows a dated DKIM selector." },
  { id: "outlook", name: "Microsoft 365 / Outlook", match: /(office365|outlook)\.com$/i, spfInclude: "include:spf.protection.outlook.com", dkimSelectors: ["selector1", "selector2"], dkimHelp: "Microsoft Defender → Email authentication → DKIM: add the selector1/selector2 CNAME records and enable signing." },
];

const CONSUMER_DOMAINS = /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|aol|icloud|me|proton|protonmail)\.[a-z.]+$/i;

export function detectProvider(smtpHost: string, fromDomain: string): Provider & { consumer: boolean } {
  const host = smtpHost.trim().toLowerCase();
  const p = PROVIDERS.find((x) => x.match.test(host));
  const consumer = CONSUMER_DOMAINS.test(fromDomain);
  if (p) {
    const { match: _m, ...rest } = p;
    void _m;
    return { ...rest, name: p.id === "google" && consumer ? "Personal Gmail" : rest.name, consumer };
  }
  return { id: "unknown", name: host || "Unknown", spfInclude: null, dkimSelectors: [], dkimHelp: "Your email provider's dashboard shows the DKIM record to add for your domain.", consumer };
}

function resolver(): Resolver {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  // Public resolvers: the host's own resolver may cache a record the owner
  // just changed for hours.
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

async function txt(r: Resolver, name: string): Promise<string[] | null> {
  try {
    return (await r.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    return null; // timeout / network — unknown, not "missing"
  }
}

export async function checkDomain(opts: { fromDomain: string; smtpHost: string }): Promise<{
  domain: string;
  provider: Provider & { consumer: boolean };
  checks: DnsCheck[];
}> {
  const domain = opts.fromDomain.trim().toLowerCase();
  const provider = detectProvider(opts.smtpHost, domain);
  const checks: DnsCheck[] = [];

  // Provider / consumer-account warning comes first: if the From address is a
  // personal Gmail, no DNS record on our side can fix it.
  if (provider.consumer) {
    checks.push({
      id: "provider",
      label: "Sending account",
      status: "fail",
      detail: `Mail is sent from a personal ${domain} address. Bulk mail from a personal mailbox lands in spam, is capped at about 500 a day, and can get the account locked. You can't add SPF/DKIM to ${domain}. Send from your own domain through Google Workspace, Resend or Amazon SES instead.`,
    });
  } else if (provider.id === "unknown") {
    checks.push({ id: "provider", label: "Sending provider", status: "unknown", detail: `SMTP host "${opts.smtpHost || "(not set)"}" isn't one this check recognises, so the SPF include and DKIM selector can't be predicted. The checks below still read your DNS.` });
  } else {
    checks.push({ id: "provider", label: "Sending provider", status: "pass", detail: `${provider.name} (from SMTP host ${opts.smtpHost}).${provider.id === "hostinger" ? " Fine for account mail; for large broadcasts a dedicated sender (Resend, Amazon SES, Brevo) keeps your main mailbox's reputation separate." : ""}` });
  }

  if (!domain || provider.consumer) {
    return { domain, provider, checks };
  }

  const r = resolver();
  const [rootTxt, dmarcTxt, mx] = await Promise.all([
    txt(r, domain),
    txt(r, `_dmarc.${domain}`),
    r.resolveMx(domain).catch((e: { code?: string }) => (e.code === "ENODATA" || e.code === "ENOTFOUND" ? [] : null)),
  ]);

  // SPF
  const spf = rootTxt?.filter((t) => /^v=spf1\b/i.test(t)) ?? null;
  const wantSpf = provider.spfInclude ? `v=spf1 ${provider.spfInclude} ~all` : "v=spf1 include:<your provider> ~all";
  if (spf === null) {
    checks.push({ id: "spf", label: "SPF", status: "unknown", detail: "DNS lookup timed out — try again." });
  } else if (spf.length === 0) {
    checks.push({ id: "spf", label: "SPF", status: "fail", detail: "No SPF record. Receivers can't tell your provider is allowed to send for this domain.", fix: [{ type: "TXT", host: "@", value: wantSpf }] });
  } else if (spf.length > 1) {
    checks.push({ id: "spf", label: "SPF", status: "fail", detail: `${spf.length} SPF records found — more than one makes SPF fail everywhere. Merge them into one.`, fix: [{ type: "TXT", host: "@", value: wantSpf, note: "Replace all existing v=spf1 records with one, keeping every include you still use." }] });
  } else if (provider.spfInclude && !spf[0].toLowerCase().includes(provider.spfInclude.toLowerCase())) {
    const merged = spf[0].replace(/\s+([~?-]all)\s*$/i, ` ${provider.spfInclude} $1`);
    checks.push({ id: "spf", label: "SPF", status: "fail", detail: `SPF exists but doesn't include ${provider.name} (${provider.spfInclude}): "${spf[0]}"`, fix: [{ type: "TXT", host: "@", value: merged === spf[0] ? wantSpf : merged, note: "Edit the existing record — don't add a second one." }] });
  } else {
    checks.push({ id: "spf", label: "SPF", status: /[+?]all\s*$/i.test(spf[0]) ? "warn" : "pass", detail: spf[0] });
  }

  // DKIM
  if (provider.dkimSelectors.length === 0) {
    checks.push({ id: "dkim", label: "DKIM", status: "unknown", detail: `Can't verify the selector from here. ${provider.dkimHelp}` });
  } else {
    const found: string[] = [];
    for (const sel of provider.dkimSelectors) {
      const recs = await txt(r, `${sel}._domainkey.${domain}`);
      if (recs && recs.some((t) => /\bp=[A-Za-z0-9+/]{20,}/.test(t))) found.push(sel);
    }
    checks.push(
      found.length
        ? { id: "dkim", label: "DKIM", status: "pass", detail: `Signing key published at ${found.map((s) => `${s}._domainkey`).join(", ")}.` }
        : { id: "dkim", label: "DKIM", status: "fail", detail: `No DKIM key at ${provider.dkimSelectors.map((s) => `${s}._domainkey.${domain}`).join(" / ")}. Without DKIM, Gmail and Yahoo send bulk mail to spam or reject it. ${provider.dkimHelp}` }
    );
  }

  // DMARC
  const dmarc = dmarcTxt?.find((t) => /^v=DMARC1/i.test(t));
  const wantDmarc = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; adkim=r; aspf=r`;
  if (dmarcTxt === null) {
    checks.push({ id: "dmarc", label: "DMARC", status: "unknown", detail: "DNS lookup timed out — try again." });
  } else if (!dmarc) {
    checks.push({ id: "dmarc", label: "DMARC", status: "fail", detail: "No DMARC record. Gmail and Yahoo require one from anyone sending more than a few thousand emails a day.", fix: [{ type: "TXT", host: "_dmarc", value: wantDmarc, note: "Start with p=none; once reports look clean for a few weeks, move to p=quarantine." }] });
  } else {
    const policy = dmarc.match(/\bp=(\w+)/i)?.[1]?.toLowerCase() ?? "?";
    checks.push({ id: "dmarc", label: "DMARC", status: "pass", detail: `Policy p=${policy}${policy === "none" ? " (monitoring only — fine to start; tighten to quarantine later)" : ""}. ${dmarc}` });
  }

  // MX — not needed to send, but a From domain that can't receive mail
  // (bounces, replies, the mailto: unsubscribe) is itself a spam signal.
  if (mx === null) {
    checks.push({ id: "mx", label: "MX", status: "unknown", detail: "DNS lookup timed out — try again." });
  } else if (mx.length === 0) {
    checks.push({ id: "mx", label: "MX", status: "warn", detail: "This domain can't receive mail, so replies and bounces are lost. Add your mailbox provider's MX records." });
  } else {
    checks.push({ id: "mx", label: "MX", status: "pass", detail: mx.sort((a, b) => a.priority - b.priority).map((m) => `${m.priority} ${m.exchange}`).join(", ") });
  }

  return { domain, provider, checks };
}
