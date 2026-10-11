import "server-only";
import { Resolver } from "node:dns/promises";

/**
 * Is this an address we should let someone sign up with?
 *
 * Every verification email we send to an address that cannot receive mail is
 * a hard bounce, and the bounce rate is the number mail providers (Amazon SES
 * above all: suspension review at 5%, recommended under 2%) judge the whole
 * platform's sending by. A typo like `gmial.com`, a made-up domain, or a
 * throwaway inbox costs reputation that every real user's password reset then
 * pays for. So the address is checked BEFORE the account and its email exist:
 *
 *   1. the domain must exist and accept mail (an MX record, or the A record
 *      RFC 5321 falls back to) — and must not publish a "null MX" (RFC 7505);
 *   2. it must not be a known disposable-inbox service;
 *   3. it must not be a mailbox that never belongs to a person (no-reply,
 *      postmaster, mailer-daemon…).
 *
 * The DNS check fails OPEN: a timeout or resolver error lets the signup
 * through, because refusing a real user over our own DNS hiccup is worse than
 * one extra bounce. Only a definite "this domain does not exist / takes no
 * mail" answer is a refusal.
 */

export type EmailCheck = { ok: true } | { ok: false; error: string };

const DISPOSABLE = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me",
  "burnermail.io", "byom.de", "dispostable.com", "discard.email", "discardmail.com",
  "dropmail.me", "emailondeck.com", "emailfake.com", "emltmp.com", "fakeinbox.com",
  "fakemail.net", "getairmail.com", "getnada.com", "nada.email", "guerrillamail.com",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamailblock.com", "sharklasers.com", "grr.la", "pokemail.net", "spam4.me",
  "harakirimail.com", "inboxbear.com", "inboxkitten.com", "incognitomail.org",
  "jetable.org", "linshiyouxiang.net", "mail.tm", "mail-temp.com", "mailcatch.com",
  "maildrop.cc", "mailinator.com", "mailinator.net", "mailinator2.com", "mailnesia.com",
  "mailpoof.com", "mailsac.com", "mintemail.com", "mohmal.com", "moakt.com", "mytemp.email",
  "mytrashmail.com", "nowmymail.com", "spambox.us", "spamgourmet.com", "spamex.com",
  "temp-mail.org", "temp-mail.io", "tempail.com", "tempmail.com", "tempmail.net",
  "tempmail.dev", "tempmailo.com", "tempmail.plus", "tempr.email", "tempinbox.com",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net", "trash-mail.com",
  "tmail.ws", "tmpmail.org", "tmpmail.net", "tmpeml.com", "yopmail.com", "yopmail.net",
  "yopmail.fr", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf", "moncourrier.fr.nf",
  "monemail.fr.nf", "monmail.fr.nf", "mailnull.com", "e4ward.com", "fakemailgenerator.com",
  "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com",
  "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "mvrht.net", "vomoto.com",
  "zetmail.com", "eyepaste.com", "mailforspam.com", "spamfree24.org", "wegwerfmail.de",
  "wegwerfmail.net", "minutemail.io", "fexbox.org", "fexpost.com", "rover.info",
  "luxusmail.org", "1secmail.com", "1secmail.org", "1secmail.net", "esiix.com",
  "wwjmp.com", "xojxe.com", "yoggm.com", "laafd.com", "txcct.com", "dpptd.com",
  "kzccv.com", "qiott.com", "vjuum.com", "chacuo.net", "bccto.me", "027168.com",
  "emailnax.com", "tempmailaddress.com", "emailtemporanea.net", "correotemporal.org",
  "mailtemp.info", "tempemail.co", "temporary-mail.net", "burnermail.com", "spamdecoy.net",
  "mail7.io", "inboxalias.com", "tempmail.us.com", "smartnator.com", "tempmail.ninja",
  "emailhook.site", "dmailpro.net", "mailto.plus", "fextemp.com", "any.pink", "mailbox.in.ua",
]);

/** Local parts that are a role or a robot, never a person signing up. */
const NON_PERSONAL = /^(no-?reply|do-?not-?reply|donotreply|postmaster|mailer-daemon|abuse|bounces?|hostmaster|devnull|null|noemail|nobody)$/i;

const CACHE = new Map<string, { at: number; ok: boolean | null }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

function resolver(): Resolver {
  const r = new Resolver({ timeout: 2500, tries: 2 });
  r.setServers(["1.1.1.1", "8.8.8.8"]);
  return r;
}

/** true = accepts mail, false = definitely does not, null = could not tell. */
async function domainAcceptsMail(domain: string): Promise<boolean | null> {
  const hit = CACHE.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;

  const r = resolver();
  let ok: boolean | null;
  try {
    const mx = await r.resolveMx(domain);
    // RFC 7505 null MX: one record, priority 0, exchange "." (Node gives "").
    const usable = mx.filter((m) => m.exchange && m.exchange !== ".");
    ok = usable.length > 0;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND") {
      ok = false; // the domain does not exist
    } else if (code === "ENODATA") {
      // No MX: RFC 5321 falls back to the domain's own address record.
      ok = await r
        .resolve4(domain)
        .then((a) => a.length > 0)
        .catch((e2: { code?: string }) =>
          e2.code === "ENODATA" || e2.code === "ENOTFOUND" ? false : null
        );
    } else {
      ok = null; // timeout / SERVFAIL — don't punish the user for it
    }
  }
  CACHE.set(domain, { at: Date.now(), ok });
  if (CACHE.size > 5000) CACHE.delete(CACHE.keys().next().value as string);
  return ok;
}

export function isDisposableDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE.has(d)) return true;
  // Subdomains of a disposable service (abc.mailinator.com).
  const parts = d.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export async function checkSignupEmail(raw: string): Promise<EmailCheck> {
  const email = String(raw ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).replace(/\.$/, "");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.includes("..")) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (NON_PERSONAL.test(local)) {
    return { ok: false, error: "Please use your own email address, not a no-reply or system address." };
  }
  if (isDisposableDomain(domain)) {
    return {
      ok: false,
      error: "Temporary or disposable email addresses can't be used. Please sign up with an email you'll keep.",
    };
  }
  const accepts = await domainAcceptsMail(domain);
  if (accepts === false) {
    return {
      ok: false,
      error: `We can't deliver email to "${domain}". Please check the address for typos.`,
    };
  }
  return { ok: true };
}
