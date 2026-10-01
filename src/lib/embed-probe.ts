import "server-only";
import { SafeFetchError, safeFetch } from "@/lib/safe-fetch";

/**
 * Can this URL actually be shown inside an iframe?
 *
 * **Cross-origin JavaScript cannot tell.** A frame blocked by
 * `X-Frame-Options: DENY` fires no error event and exposes nothing readable —
 * the user just gets a black rectangle, and the admin who added the game never
 * finds out. The headers, however, are perfectly visible to the server.
 *
 * This is deliberately advisory: a probe that fails is a strong signal, but a
 * probe that passes is not a guarantee (a game can still break for its own
 * reasons), which is why the player also runs a load watchdog.
 */

export interface EmbedProbeResult {
  ok: boolean;
  /** The blocking header value, when there is one. */
  xfo?: string | null;
  csp?: string | null;
  status?: number;
  /** Human-readable reason, ready to show an admin. */
  reason?: string;
  checkedAt: string;
}

const TIMEOUT_MS = 8_000;

export async function probeEmbed(url: string): Promise<EmbedProbeResult> {
  const checkedAt = new Date().toISOString();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "That isn't a valid URL.", checkedAt };
  }
  if (parsed.protocol !== "https:") {
    // The admin panel and the player are both https; an http frame is blocked
    // as mixed content before any header matters.
    return {
      ok: false,
      reason: "Games must be served over https — an http page is blocked as mixed content.",
      checkedAt,
    };
  }

  try {
    // GET, not HEAD: plenty of hosts answer HEAD differently (or not at all),
    // and the framing headers only appear on the real response.
    // Through the shared outbound fetcher: the admin-typed URL (and every
    // redirect hop) must not point inside our network. No rate limit — an
    // admin pressing "check" is not a flood.
    const { response: res } = await safeFetch(parsed, {
      method: "GET",
      timeoutMs: TIMEOUT_MS,
      maxRedirects: 5,
      rateLimit: false,
      purpose: "embed_probe",
      // Some hosts vary their framing headers by client; ask as a browser would.
      userAgent: "Mozilla/5.0 (compatible; RevType-EmbedProbe/1.0; +https://revtype.com)",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    // Only the headers matter; don't download the page.
    await res.body?.cancel().catch(() => {});

    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        xfo,
        csp,
        reason: `The game URL returned HTTP ${res.status}.`,
        checkedAt,
      };
    }

    if (xfo) {
      const v = xfo.toLowerCase();
      if (v.includes("deny")) {
        return {
          ok: false,
          xfo,
          csp,
          status: res.status,
          reason: `Blocked: the site sends "X-Frame-Options: ${xfo}", which forbids being framed anywhere.`,
          checkedAt,
        };
      }
      if (v.includes("sameorigin")) {
        return {
          ok: false,
          xfo,
          csp,
          status: res.status,
          reason: `Blocked: the site sends "X-Frame-Options: ${xfo}", so it only allows framing by itself.`,
          checkedAt,
        };
      }
    }

    if (csp) {
      const match = /frame-ancestors([^;]*)/i.exec(csp);
      if (match) {
        const value = match[1].trim();
        // 'none' blocks everyone. A specific allow-list won't include us either,
        // unless it is a wildcard.
        const permissive = value.includes("*") || value.includes("https:");
        if (value.includes("'none'") || !permissive) {
          return {
            ok: false,
            xfo,
            csp,
            status: res.status,
            reason: `Blocked: the site's Content-Security-Policy sets "frame-ancestors ${value}", which doesn't allow this site.`,
            checkedAt,
          };
        }
      }
    }

    return { ok: true, xfo, csp, status: res.status, checkedAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut =
      (err instanceof SafeFetchError && err.reason === "timeout") ||
      msg.includes("timeout") ||
      msg.includes("aborted");
    return {
      ok: false,
      reason: timedOut
        ? "The game URL didn't respond within 8 seconds."
        : `Couldn't reach the game URL (${msg}).`,
      checkedAt,
    };
  }
}
