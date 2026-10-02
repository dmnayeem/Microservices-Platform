/**
 * Email templates, colours and deliverability headers — rendering only.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-email.ts
 *
 * Sends NOTHING: templates are rendered and the nodemailer message is built
 * (`buildMessage`) without a transport. Reads settings (brand) from the DB.
 *
 * What it guards, each of which reached a real inbox at least once:
 *   - the old brand name in a sender, subject or footer;
 *   - a badge/button colour pair under WCAG 4.5:1 (black-on-blue "UPDATE");
 *   - an HTML-only message (no text/plain part);
 *   - List-Unsubscribe on a password reset, or missing on a broadcast;
 *   - a relative or non-https URL in a message (dead in every mail client).
 */
import { NOTIFICATION_STYLES } from "../src/lib/notification-styles";
import { contrastRatio } from "../src/lib/color-contrast";
import { decodeEmailBody, encodeEmailBody, emailHtmlToText, toEmailSafeHtml } from "../src/lib/email-html";
import {
  getEmailBrand,
  listUnsubscribeFor,
  renderNotificationEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from "../src/lib/email";
import { buildMessage, getMailConfig } from "../src/lib/mailer";
import { signUnsubscribeToken, unsubscribeUrls, verifyUnsubscribeToken } from "../src/lib/unsubscribe";
import { detectProvider } from "../src/lib/email-dns";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

// Tailwind v3/v4 palette hexes for the shades notification-styles uses.
const TW: Record<string, string> = {
  "rose-600": "#e11d48", "rose-700": "#be123c",
  "amber-400": "#fbbf24", "amber-500": "#f59e0b",
  "yellow-300": "#fde047", "yellow-400": "#facc15",
  "sky-700": "#0369a1", "sky-800": "#075985",
  "emerald-700": "#047857", "emerald-800": "#065f46",
  "orange-700": "#c2410c", "orange-800": "#9a3412",
  "violet-600": "#7c3aed", "violet-700": "#6d28d9",
  "fuchsia-700": "#a21caf",
  "cyan-700": "#0e7490", "cyan-800": "#155e75",
  "slate-600": "#475569", "slate-700": "#334155",
  white: "#ffffff", black: "#000000",
};

function webPairs(cls: string): Array<{ bg: string; fg: string; label: string }> {
  const fg = cls.match(/(?:^|\s)text-(white|black)(?:\s|$)/)?.[1];
  if (!fg) return [];
  const bgs = [
    ...[...cls.matchAll(/(?:^|\s)(?:bg|from|to|hover:bg)-([a-z]+-\d{3})(?=\s|$)/g)].map((m) => m[1]),
  ];
  return bgs.map((b) => ({ bg: b, fg, label: `${b} / text-${fg}` }));
}

function urlsIn(html: string): string[] {
  return [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

function assertEmail(name: string, m: RenderedEmail, opts: { unsubscribe: boolean }) {
  const all = `${m.subject}\n${m.html}\n${m.text}`;
  check(`${name}: no "EarnGPT"`, !/earn\s*gpt/i.test(all));
  check(`${name}: has a plain-text part`, m.text.trim().length > 40, `${m.text.length} chars`);
  check(`${name}: no <style> / class= (inline only)`, !/<style\b|\sclass=/i.test(m.html));
  const bad = urlsIn(m.html).filter((u) => !/^https:\/\//.test(u) && !/^mailto:/.test(u));
  check(`${name}: every link/image absolute https`, bad.length === 0, bad.slice(0, 3).join(", "));
  check(
    `${name}: unsubscribe link ${opts.unsubscribe ? "present" : "absent"}`,
    /Unsubscribe/.test(m.html) === opts.unsubscribe && /Unsubscribe:/.test(m.text) === opts.unsubscribe
  );
  const imgs = [...m.html.matchAll(/<img\b[^>]*>/g)].map((x) => x[0]);
  check(`${name}: every <img> has alt`, imgs.every((i) => /\salt="/.test(i)));
}

async function main() {
  console.log("\n── Colour contrast (WCAG AA 4.5:1) ──");
  for (const s of NOTIFICATION_STYLES) {
    const btn = contrastRatio(s.mail.accent, "#ffffff");
    check(`mail ${s.id}: white on accent ${s.mail.accent} (button, kicker on white)`, btn >= 4.5, btn.toFixed(2));
    const badge = contrastRatio(s.mail.ink, s.mail.soft);
    check(`mail ${s.id}: badge ${s.mail.ink} on ${s.mail.soft}`, badge >= 4.5, badge.toFixed(2));
    if (s.id === "PLAIN") continue; // theme tokens (--app-*), not a fixed palette
    for (const cls of [s.web.chip, s.web.button]) {
      for (const p of webPairs(cls)) {
        const bg = TW[p.bg];
        if (!bg) {
          check(`web ${s.id}: ${p.label} has a known hex`, false, "add it to TW");
          continue;
        }
        const r = contrastRatio(bg, TW[p.fg]);
        check(`web ${s.id}: ${p.label}`, r >= 4.5, r.toFixed(2));
      }
    }
  }

  console.log("\n── Brand ──");
  const brand = await getEmailBrand();
  check("brand name comes from settings", !!brand.name && !/earn\s*gpt/i.test(brand.name), brand.name);
  check("logo is absolute https", !brand.logoUrl || brand.logoUrl.startsWith("https://"), brand.logoUrl ?? "(none)");
  check("help/privacy links absolute", brand.helpUrl.startsWith("https://") && brand.privacyUrl.startsWith("https://"));

  console.log("\n── Templates ──");
  assertEmail("verification", renderVerificationEmail(brand, "tok123", "Ada"), { unsubscribe: false });
  assertEmail("password reset", renderPasswordResetEmail(brand, "tok123", "Ada"), { unsubscribe: false });
  assertEmail("welcome", renderWelcomeEmail(brand, "Ada"), { unsubscribe: false });
  for (const s of NOTIFICATION_STYLES) {
    assertEmail(
      `notification ${s.id}`,
      renderNotificationEmail(brand, "Your withdrawal was paid", "We sent $12.50 to your wallet.\n\nThanks!", "/wallet", {
        style: s.id,
        kicker: "Today",
        transactional: true,
      }),
      { unsubscribe: false }
    );
  }
  const unsub = unsubscribeUrls(brand.siteUrl, "cltestuser0001");
  const richIn = `
    <h2>Big news</h2>
    <p>Read <a href="/blog/launch">the post</a>, <a href="https://example.com/x?a=1&amp;b=2">partner</a>,
    <a href="javascript:alert(1)">bad</a>, <a href="http://insecure.example.com">http</a>.</p>
    <p><img src="https://d2b71509bk9h3c.cloudfront.net/media/images/a.png" alt="Banner"></p>
    <p><img src="data:image/png;base64,AAAA"></p>
    <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>
    <ul><li><p>One</p></li><li><p><span style="color:#ffffff">Two</span></p></li></ul><hr>
    <table><tbody><tr><th>A</th><td colspan="2">B</td></tr></tbody></table>`;
  const rich = renderNotificationEmail(brand, "Launch", "fallback", "https://revtype.com/tasks", {
    style: "UPDATE",
    html: richIn,
    preheader: "The preheader",
    actionLabel: "Open",
    unsubscribe: unsub,
  });
  assertEmail("broadcast (rich)", rich, { unsubscribe: true });
  check("rich: relative link made absolute", rich.html.includes(`${brand.siteUrl}/blog/launch`));
  check("rich: javascript: and http: links removed", !/javascript:|http:\/\/insecure/.test(rich.html));
  check("rich: data: image removed", !/data:image/.test(rich.html));
  check("rich: own media routed through /api/media", rich.html.includes(`${brand.siteUrl}/api/media/media/images/a.png`));
  check("rich: img responsive (width attr + max-width)", /<img[^>]*alt="Banner"[^>]*width="\d+"[^>]*max-width/.test(rich.html));
  check("rich: YouTube embed became a link", rich.html.includes("youtube.com/watch?v=dQw4w9WgXcQ") && !/<iframe/i.test(rich.html));
  check("rich: editor text colours stripped", !/color:#ffffff">Two/.test(rich.html));
  check("rich: preheader present (hidden)", /display:none[^>]*>The preheader/.test(rich.html));
  check("rich: text part keeps link targets", rich.text.includes(`the post (${brand.siteUrl}/blog/launch)`));
  assertEmail(
    "broadcast (plain)",
    renderNotificationEmail(brand, "Hello", "Line one\n\nLine <two> & three", undefined, { unsubscribe: unsub }),
    { unsubscribe: true }
  );

  console.log("\n── Stored body + converter ──");
  const enc = encodeEmailBody({ format: "html", body: "<p>x</p>", preheader: "Hi -->& there" });
  const dec = decodeEmailBody(enc);
  check("rich body round-trips", dec.format === "html" && dec.body === "<p>x</p>" && dec.preheader === "Hi -->& there");
  check("legacy plain body decodes as text", decodeEmailBody("hello\nworld").format === "text");
  check("plain body without preheader stored unchanged", encodeEmailBody({ format: "text", body: "hi", preheader: "" }) === "hi");
  const conv = toEmailSafeHtml('<a href="mailto:a@b.co">mail</a><a href="#x">anchor</a>', { baseUrl: "https://revtype.com" });
  check("mailto kept, #anchor unwrapped", conv.links.length === 1 && conv.html.includes("mailto:a@b.co") && !conv.html.includes('href="#x"'));
  check("text conversion of lists", emailHtmlToText("<ul><li>a</li><li>b</li></ul>").includes("- a\n- b"));

  console.log("\n── Headers (built, not sent) ──");
  const cfg = { ...(await getMailConfig()) };
  check("From name has no old brand", !/earn\s*gpt/i.test(cfg.from), cfg.from);
  const tx = buildMessage(cfg, { to: "a@example.com", subject: "s", html: "<p>Hello there</p>", ...listUnsubscribeFor(null, cfg) });
  check("transactional: no List-Unsubscribe", !("headers" in tx) || !JSON.stringify(tx).includes("List-Unsubscribe"));
  check("transactional: text part generated from HTML", tx.text === "Hello there");
  check("Message-ID on the From domain", new RegExp(`@${cfg.fromDomain.replace(/\./g, "\\.")}>$`).test(tx.messageId), tx.messageId);
  check("Reply-To set", !!tx.replyTo, tx.replyTo);
  check("Date set", tx.date instanceof Date);
  const bulk = buildMessage(cfg, { to: "a@example.com", subject: "s", html: rich.html, text: rich.text, ...listUnsubscribeFor(unsub, cfg) });
  const h = (bulk as { headers?: Record<string, string> }).headers ?? {};
  check("broadcast: List-Unsubscribe has https one-click URL", (h["List-Unsubscribe"] ?? "").includes(`<${unsub.oneClick}>`), h["List-Unsubscribe"]);
  check("broadcast: List-Unsubscribe has mailto", /<mailto:[^>]+>/.test(h["List-Unsubscribe"] ?? ""));
  check("broadcast: List-Unsubscribe-Post one-click", h["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click");
  check("no Precedence: bulk", !JSON.stringify(bulk).includes("Precedence"));

  console.log("\n── Unsubscribe token ──");
  const tok = signUnsubscribeToken("cltestuser0001");
  check("token verifies", verifyUnsubscribeToken(tok) === "cltestuser0001");
  check("tampered token refused", verifyUnsubscribeToken(tok.slice(0, -2) + "xx") === null);
  check("other user's payload refused", verifyUnsubscribeToken(Buffer.from("someoneelse1").toString("base64url") + tok.slice(tok.indexOf("."))) === null);

  console.log("\n── Provider detection ──");
  check("personal Gmail flagged consumer", detectProvider("smtp.gmail.com", "gmail.com").consumer === true);
  check("Workspace on own domain not consumer", detectProvider("smtp.gmail.com", "revtype.com").consumer === false);
  check("Hostinger recognised", detectProvider("smtp.hostinger.com", "revtype.com").id === "hostinger");

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll email checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
