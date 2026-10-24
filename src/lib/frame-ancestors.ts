/**
 * Does a `frame-ancestors` source list let `origin` embed a page served from
 * `pageOrigin`? CSP source-expression matching, the parts that matter here:
 * `*`, scheme-only (`https:`), `'self'`, `'none'`, and host sources with an
 * optional scheme, a leading `*.` wildcard and a port.
 *
 * It used to be `value.includes("*") || value.includes("https:")` — and every
 * host source like `https://games.example.app` contains "https:", so a site
 * that allowed ONLY its own domain was reported as embeddable.
 *
 * No imports on purpose: lib/embed-probe.ts is server-only, this is pure.
 */
export function ancestorsAllow(value: string, origin: string, pageOrigin: string): boolean {
  const o = new URL(origin);
  for (const raw of value.split(/\s+/).filter(Boolean)) {
    const t = raw.toLowerCase();
    if (t === "'none'") continue;
    if (t === "*") return true;
    if (t === "'self'") {
      if (o.origin === new URL(pageOrigin).origin) return true;
      continue;
    }
    // Scheme-only source, e.g. "https:".
    if (/^[a-z][a-z0-9+.-]*:$/.test(t)) {
      if (t === o.protocol) return true;
      continue;
    }
    // Host source: [scheme://]host[:port][/path]
    const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/.exec(t);
    if (!m) continue;
    const [, scheme, wildcard, host, port] = m;
    if (scheme && scheme + ":" !== o.protocol) continue;
    const defaultPort = o.protocol === "https:" ? "443" : "80";
    if (port && port !== "*" && port !== (o.port || defaultPort)) continue;
    const h = o.hostname;
    if (wildcard ? h.endsWith("." + host) : h === host) return true;
  }
  return false;
}
