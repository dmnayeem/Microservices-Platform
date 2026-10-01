/**
 * verify-safe-fetch — the one outbound fetcher for user-supplied URLs.
 *
 *   npx tsx scripts/verify-safe-fetch.ts
 *
 * No database. Network is only touched by the last section (one DNS lookup of
 * example.com); offline, those checks say so instead of failing.
 */
import * as fs from "fs";
import * as path from "path";
import {
  isBlockedIp,
  guardUrl,
  safeFetch,
  safeFetchBytes,
  safeFetchText,
  limitDomain,
  SafeFetchError,
  __setOutboundLimitsForTest,
  __resetSafeFetchState,
  __setSignalSinkForTest,
  type Resolver,
} from "../src/lib/safe-fetch";
import type { AbuseSignal } from "../src/lib/abuse/signal";
import {
  evaluateContentRules,
  shouldAutoReject,
  defaultContentRules,
} from "../src/lib/link-verify";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}
async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof SafeFetchError ? e.reason : `other:${(e as Error)?.message}`;
  }
}

const root = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** DNS stub: a table of host → addresses; anything else fails to resolve. */
function resolverOf(table: Record<string, string[]>): Resolver {
  return async (host) => {
    const a = table[host];
    if (!a) throw new Error("ENOTFOUND");
    return a;
  };
}

/** fetch stub: a table of href → response factory, recording every call. */
function fetchOf(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const href = input.toString();
    calls.push(href);
    const r = routes[href];
    if (!r) throw new Error(`unexpected fetch ${href}`);
    return r();
  }) as typeof fetch;
  return { impl, calls };
}

const redirect = (to: string) => () =>
  new Response(null, { status: 302, headers: { location: to } });
const html = (body: string) => () =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

/** A body streamed in 64KB chunks, with or without a Content-Length. */
function bigBody(bytes: number, withLength: boolean) {
  return () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= bytes) return c.close();
        const n = Math.min(65536, bytes - sent);
        sent += n;
        c.enqueue(new Uint8Array(n).fill(97));
      },
    });
    const headers: Record<string, string> = { "content-type": "image/png" };
    if (withLength) headers["content-length"] = String(bytes);
    return new Response(stream, { status: 200, headers });
  };
}

const PUBLIC = resolverOf({
  "example.com": ["93.184.215.14"],
  "www.example.com": ["93.184.215.14"],
  "a.example.com": ["93.184.215.14"],
  "b.example.com": ["93.184.215.14"],
  "internal.example.com": ["10.0.0.5"],
  "mixed.example.com": ["93.184.215.14", "127.0.0.1"],
  "v6-metadata.example.com": ["fd00:ec2::254"],
  "bucket.s3.us-east-1.amazonaws.com": ["52.216.0.1"],
});

async function main() {
  __setSignalSinkForTest(() => {});
  __setOutboundLimitsForTest({ domainPerMin: 1000, domainPerHour: 1000, userPerHour: 1000 });

  /* ── 1. IP range classifier ── */
  console.log("\n1. IP range classifier");
  const blocked = [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "100.127.255.255", "0.0.0.0", "224.0.0.1",
    "255.255.255.255", "192.0.0.8", "198.18.0.1",
    "::1", "::", "fc00::1", "fd12:3456::1", "fd00:ec2::254", "fe80::1", "fe80::1%eth0",
    "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:10.0.0.1", "64:ff9b::a9fe:a9fe",
    "2002:7f00:0001::", "2001:db8::1", "::127.0.0.1", "not-an-ip", "",
  ];
  const allowed = [
    "8.8.8.8", "1.1.1.1", "93.184.215.14", "172.32.0.1", "100.128.0.1", "169.255.0.1",
    "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "2002:0808:0808::",
  ];
  const wrongBlocked = allowed.filter(isBlockedIp);
  const wrongAllowed = blocked.filter((ip) => !isBlockedIp(ip));
  check(`every private/loopback/link-local/metadata/CGNAT/ULA address is blocked (${blocked.length})`, wrongAllowed.length === 0, `allowed: ${wrongAllowed.join(", ")}`);
  check(`public v4 and v6 addresses pass (${allowed.length})`, wrongBlocked.length === 0, `blocked: ${wrongBlocked.join(", ")}`);

  /* ── 2. URL guard ── */
  console.log("\n2. URL guard");
  const g = (u: string, o = {}) => reason(guardUrl(u, { resolver: PUBLIC, ...o }));
  check("ftp:// is refused", (await g("ftp://example.com/x")) === "blocked");
  check("file:// is refused", (await g("file:///etc/passwd")) === "blocked");
  check("localhost is refused", (await g("http://localhost:3000/")) === "blocked");
  check("a single-label host is refused", (await g("http://intranet/")) === "blocked");
  check("*.internal is refused", (await g("http://metadata.google.internal/")) === "blocked");
  check("the metadata IP is refused", (await g("http://169.254.169.254/latest/meta-data/")) === "blocked");
  check("decimal-encoded loopback is refused", (await g("http://2130706433/")) === "blocked");
  check("bracketed IPv6 loopback is refused", (await g("http://[::1]/")) === "blocked");
  check("a public IP-literal host is refused by default", (await g("http://8.8.8.8/")) === "blocked");
  check("…and allowed when the caller opts in", (await g("http://8.8.8.8/", { allowIpLiteral: true })) === "ok");
  check("a non-standard port is refused", (await g("http://example.com:8080/")) === "blocked");
  check("…unless allow-listed", (await g("http://example.com:8080/", { allowPorts: [8080] })) === "ok");
  check("explicit :443 / :80 pass", (await g("https://example.com:443/")) === "ok" && (await g("http://example.com:80/")) === "ok");
  check("credentials in the URL are refused", (await g("https://user:pw@example.com/")) === "blocked");
  check("a host resolving to a private IP is refused", (await g("https://internal.example.com/")) === "blocked");
  check("a host with ONE private record among public ones is refused", (await g("https://mixed.example.com/")) === "blocked");
  check("a host resolving to an IPv6 ULA (AWS v6 metadata) is refused", (await g("https://v6-metadata.example.com/")) === "blocked");
  check("an unresolvable host fails as dns", (await g("https://nope.example.org/")) === "dns");
  check("a public host passes", (await g("https://example.com/post/1")) === "ok");

  /* ── 3. Redirects ── */
  console.log("\n3. Redirects are re-checked on every hop");
  {
    const f = fetchOf({
      "https://example.com/r": redirect("http://internal.example.com/admin"),
    });
    const r = await reason(safeFetch("https://example.com/r", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a redirect to a host that resolves privately is refused", r === "blocked", r);
    check("…and the private host is never contacted", f.calls.length === 1 && !f.calls.some((c) => c.includes("internal")));
  }
  {
    const f = fetchOf({ "https://example.com/r": redirect("http://169.254.169.254/latest/meta-data/") });
    const r = await reason(safeFetch("https://example.com/r", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a redirect to the metadata IP is refused", r === "blocked" && f.calls.length === 1, r);
  }
  {
    const f = fetchOf({ "https://example.com/r": redirect("file:///etc/passwd") });
    const r = await reason(safeFetch("https://example.com/r", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a redirect to file:// is refused", r === "blocked", r);
  }
  {
    const f = fetchOf({
      "https://example.com/1": redirect("/2"),
      "https://example.com/2": redirect("https://www.example.com/3"),
      "https://www.example.com/3": redirect("https://a.example.com/4"),
      "https://a.example.com/4": html("<title>ok</title>"),
    });
    const r = await safeFetchText("https://example.com/1", { resolver: PUBLIC, fetchImpl: f.impl });
    check("three public redirects are followed", r.body.includes("ok") && r.finalUrl.href === "https://a.example.com/4");
  }
  {
    const f = fetchOf({
      "https://example.com/1": redirect("/2"),
      "https://example.com/2": redirect("/3"),
      "https://example.com/3": redirect("/4"),
      "https://example.com/4": redirect("/5"),
      "https://example.com/5": html("x"),
    });
    const r = await reason(safeFetch("https://example.com/1", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a fourth redirect is refused", r === "too_many_redirects", r);
  }
  {
    let redirectMode: string | undefined;
    const impl = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      redirectMode = init?.redirect;
      return html("x")();
    }) as typeof fetch;
    await safeFetch("https://example.com/", { resolver: PUBLIC, fetchImpl: impl });
    check("redirects are handled by hand, never by fetch itself", redirectMode === "manual");
  }

  /* ── 4. Size and type caps ── */
  console.log("\n4. Size and content-type caps");
  {
    const f = fetchOf({ "https://example.com/big": bigBody(3 * 1024 * 1024, false) });
    const r = await reason(safeFetchBytes("https://example.com/big", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a 3MB body with no Content-Length is cut off at the 2MB default", r === "too_large", r);
  }
  {
    const f = fetchOf({ "https://example.com/big": bigBody(3 * 1024 * 1024, true) });
    const r = await reason(safeFetchBytes("https://example.com/big", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a declared Content-Length over the cap is refused up front", r === "too_large", r);
  }
  {
    const f = fetchOf({ "https://example.com/big": bigBody(3 * 1024 * 1024, false) });
    const r = await safeFetchBytes("https://example.com/big", {
      resolver: PUBLIC, fetchImpl: f.impl, maxBytes: 1_000_000, overflow: "truncate",
    });
    check("truncate mode keeps exactly maxBytes (HTML meta sits near the top)", r.body.length === 1_000_000, String(r.body.length));
  }
  {
    const f = fetchOf({ "https://example.com/small": bigBody(100_000, true) });
    const r = await safeFetchBytes("https://example.com/small", { resolver: PUBLIC, fetchImpl: f.impl });
    check("a body under the cap is read whole", r.body.length === 100_000);
  }
  {
    const f = fetchOf({ "https://example.com/img": bigBody(10, true) });
    const r = await reason(safeFetchText("https://example.com/img", { resolver: PUBLIC, fetchImpl: f.impl, accept: ["html"] }));
    check("an image where HTML was asked for is refused", r === "bad_type", r);
  }
  {
    const f = fetchOf({ "https://example.com/404": () => new Response("no", { status: 404 }) });
    const r = await reason(safeFetchText("https://example.com/404", { resolver: PUBLIC, fetchImpl: f.impl }));
    check("a non-2xx read is an http_error", r === "http_error", r);
  }
  {
    let ua = "";
    let contact = "";
    const impl = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      ua = h.get("user-agent") ?? "";
      contact = h.get("x-abuse-contact") ?? "";
      return html("x")();
    }) as typeof fetch;
    const CR = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
    await safeFetch("https://example.com/", { resolver: PUBLIC, fetchImpl: impl, userAgent: CR });
    check("the crawler UA is sent byte-for-byte (smart verification depends on it)", ua === CR, ua);
    check("every request carries the abuse contact", contact === "https://revtype.com/abuse", contact);
  }

  /* ── 5. Rate limits ── */
  console.log("\n5. Outbound rate limits");
  const signals: AbuseSignal[] = [];
  __setSignalSinkForTest((s) => signals.push(s));
  __resetSafeFetchState();
  __setOutboundLimitsForTest({ domainPerMin: 3, domainPerHour: 100, userPerHour: 100 });
  {
    const f = fetchOf({
      "https://a.example.com/": html("x"),
      "https://b.example.com/": html("x"),
      "https://example.com/": html("x"),
    });
    const o = { resolver: PUBLIC, fetchImpl: f.impl };
    const rs = [
      await reason(safeFetch("https://a.example.com/", o)),
      await reason(safeFetch("https://b.example.com/", o)),
      await reason(safeFetch("https://example.com/", o)),
      await reason(safeFetch("https://a.example.com/", o)),
      await reason(safeFetch("https://b.example.com/", o)),
    ];
    check("per-domain: the 4th fetch to one site in a minute is skipped", rs.join() === "ok,ok,ok,rate_limited,rate_limited", rs.join());
    check("…subdomains share the site's counter", limitDomain("a.example.com") === limitDomain("b.example.com"));
    check("…a skipped fetch never reaches the network", f.calls.length === 3);
    check("…and the Abuse Center hears about it ONCE per window", signals.length === 1 && signals[0].kind === "OUTBOUND_LIMIT", String(signals.length));
    check(
      "…shared-hosting subdomains (S3 buckets) are NOT lumped together",
      limitDomain("one.s3.amazonaws.com") !== limitDomain("two.s3.amazonaws.com")
    );
  }
  __resetSafeFetchState();
  signals.length = 0;
  __setOutboundLimitsForTest({ domainPerMin: 100, domainPerHour: 100, userPerHour: 2 });
  {
    const f = fetchOf({
      "https://example.com/1": html("x"),
      "https://example.com/2": html("x"),
      "https://example.com/3": html("x"),
    });
    const o = { resolver: PUBLIC, fetchImpl: f.impl, userId: "u1" };
    const rs = [
      await reason(safeFetch("https://example.com/1", o)),
      await reason(safeFetch("https://example.com/1", o)), // same page again (crawler → browser retry)
      await reason(safeFetch("https://example.com/2", o)),
      await reason(safeFetch("https://example.com/1", o)), // still an already-counted page
      await reason(safeFetch("https://example.com/3", o)),
      await reason(safeFetch("https://example.com/3", { ...o, userId: "u2" })),
    ];
    check("per-user: counts DISTINCT links — re-reading a page is free", rs.slice(0, 4).every((r) => r === "ok"), rs.join());
    check("…a third distinct link in the hour is skipped", rs[4] === "rate_limited", rs[4]);
    check("…another user is unaffected", rs[5] === "ok", rs[5]);
    check(
      "…one MEDIUM signal naming the user",
      signals.length === 1 && signals[0].userId === "u1" && signals[0].severity === "MEDIUM",
      JSON.stringify(signals)
    );
  }
  __resetSafeFetchState();
  __setOutboundLimitsForTest({ domainPerMin: 1, domainPerHour: 1, userPerHour: 1 });
  {
    const f = fetchOf({ "https://example.com/1": html("x"), "https://example.com/2": html("x") });
    const o = { resolver: PUBLIC, fetchImpl: f.impl, rateLimit: false, userId: "u1" };
    const rs = [await reason(safeFetch("https://example.com/1", o)), await reason(safeFetch("https://example.com/2", o))];
    check("rateLimit:false (ad creatives, admin probes) is guarded but never limited", rs.join() === "ok,ok");
    const r = await reason(safeFetch("https://internal.example.com/", o));
    check("…and still SSRF-guarded", r === "blocked", r);
  }
  __resetSafeFetchState();
  {
    process.env.AWS_S3_BUCKET_NAME = "bucket";
    const f = fetchOf({
      "https://bucket.s3.us-east-1.amazonaws.com/task-proofs/a.png": bigBody(10, true),
      "https://bucket.s3.us-east-1.amazonaws.com/task-proofs/b.png": bigBody(10, true),
    });
    const o = { resolver: PUBLIC, fetchImpl: f.impl, userId: "u9" };
    const rs = [
      await reason(safeFetch("https://bucket.s3.us-east-1.amazonaws.com/task-proofs/a.png", o)),
      await reason(safeFetch("https://bucket.s3.us-east-1.amazonaws.com/task-proofs/b.png", o)),
    ];
    check("our own bucket is not rate-limited (proof screenshots)", rs.join() === "ok,ok", rs.join());
  }

  /* ── 6. A skipped fetch is "couldn't read", never "reject" ── */
  console.log("\n6. Smart verification: a skipped fetch can never auto-reject");
  const strict = {
    ...defaultContentRules(),
    criteria: [{ kind: "text" as const, value: "promo" }],
    onMismatch: "reject" as const,
  };
  const ev = evaluateContentRules(null, strict);
  check("no page (what a skipped fetch returns) → unverifiable", ev.verdict === "unverifiable", ev.verdict);
  check("…which never auto-rejects, even on a reject-on-mismatch task", !shouldAutoReject(ev.verdict, strict));

  const submit = read("src/app/api/tasks/[id]/submit/route.ts");
  check(
    "submit: a null page for a CODE item is unverifiable",
    /if \(html === null\) status = "unverifiable"/.test(submit)
  );
  check(
    "submit + re-check read proofs through fetchRawHtml, charged to the user",
    /fetchRawHtml\(u, CRAWLER_UA, VERIFY_MAX_BYTES, \{ userId: session\.user\.id \}\)/.test(submit) &&
      /fetchRawHtml\(url, CRAWLER_UA, VERIFY_MAX_BYTES, \{ userId \}\)/.test(read("src/lib/social-recheck.ts"))
  );
  const lp = read("src/lib/link-preview.ts");
  check(
    "fetchRawHtml turns every failure (incl. a rate-limit skip) into null",
    /export async function fetchRawHtml[\s\S]{0,500}catch \{[\s\S]{0,300}return null;/.test(lp)
  );
  check(
    "a rate-limited preview is not cached as 'no card'",
    /reason === "rate_limited"\) return null;/.test(lp)
  );

  // Live: fetchRawHtml with the limits spent returns null because of the limit.
  __resetSafeFetchState();
  __setOutboundLimitsForTest({ domainPerMin: 0, domainPerHour: 0, userPerHour: 0 });
  signals.length = 0;
  const { fetchRawHtml, CRAWLER_UA } = await import("../src/lib/link-preview");
  const got = await fetchRawHtml("https://example.com/", CRAWLER_UA, undefined, { userId: "u1" });
  if (signals.length === 0) {
    console.log("  skip live rate-limit check (no DNS — offline?)");
  } else {
    check("live: fetchRawHtml over the limit returns null (→ unverifiable)", got === null);
    check("…and raised OUTBOUND_LIMIT", signals[0]?.kind === "OUTBOUND_LIMIT");
  }

  /* ── 7. One guard, every caller ── */
  console.log("\n7. One SSRF guard, every caller");
  check("link-preview has no guard or fetch of its own", !/node:dns|\bfetch\(/.test(lp) && /from "@\/lib\/safe-fetch"/.test(lp));
  for (const f of [
    "src/app/api/spaces/media/[id]/route.ts",
    "src/app/api/marketplace/listings/route.ts",
    "src/lib/embed-probe.ts",
  ]) {
    const src = read(f);
    check(`${f} fetches through safe-fetch`, /from "@\/lib\/safe-fetch"/.test(src) && !/await fetch\(/.test(src));
  }
  check(
    "link-verify stays client-safe (no server fetcher import)",
    !/from "@\/lib\/(link-preview|safe-fetch)"/.test(read("src/lib/link-verify.ts"))
  );

  __setOutboundLimitsForTest(null);
  __setSignalSinkForTest(null);
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
