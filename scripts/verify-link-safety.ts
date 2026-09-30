/**
 * Unit checks for src/lib/link-safety.ts. No database, no network: config and
 * fetch are injected.
 *
 *   npx tsx scripts/verify-link-safety.ts
 */
import {
  checkUrls,
  clearLinkSafetyCache,
  domainMatches,
  extractUrls,
  extractUrlsFromHtml,
  localVerdict,
  normaliseDomainList,
  refuses,
  screenLinks,
  type LinkSafetyConfig,
} from "../src/lib/link-safety";
import { validateSettingValues } from "../src/lib/setting-guards";

let failed = 0;
function ok(cond: unknown, name: string) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}`);
  }
}

const base: LinkSafetyConfig = {
  mode: "flag",
  blockedDomains: normaliseDomainList(["https://Evil.example/path", "*.bad.test", "phish.io"]),
  safeBrowsingKey: "",
};

async function main() {
  console.log("schemes");
  for (const u of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd", "vbscript:msgbox"]) {
    ok(localVerdict(u, base).status === "hard", `hard: ${JSON.stringify(u)}`);
  }
  for (const u of ["mailto:a@b.com", "tel:+8801", "market://details?id=x", "intent://scan#Intent;end", "https://example.com", "example.com:8080/x"]) {
    ok(localVerdict(u, base).status === "ok", `not hard: ${u}`);
  }

  console.log("blocklist");
  ok(base.blockedDomains.join(",") === "evil.example,bad.test,phish.io", "normalised list");
  ok(normaliseDomainList("a.com, b.com\nc.com").length === 3, "string list split");
  ok(domainMatches("login.evil.example", "evil.example"), "subdomain matches");
  ok(!domainMatches("notevil.example", "evil.example"), "suffix without dot does not match");
  ok(localVerdict("https://x.y.bad.test/a", base).status === "hard", "deep subdomain blocked");
  ok(localVerdict("phish.io/login", base).status === "hard", "bare blocklisted host");
  ok(localVerdict("https://phish.io.safe.com", base).status === "ok", "blocklisted name as a label is not a match");
  ok(localVerdict("https://evil.example", { ...base, mode: "off" }).status === "hard", "blocklist applies even when mode is off");

  console.log("heuristics");
  ok(localVerdict("http://192.168.1.10/x", base).status === "suspicious", "IPv4 host suspicious");
  ok(localVerdict("http://[::1]/", base).status === "suspicious", "IPv6 host suspicious");
  // "rеvtype.com" with a Cyrillic е
  const fake = new URL("https://rеvtype.com").hostname;
  ok(localVerdict(`https://${fake}/login`, base).status === "unsafe", `look-alike of our domain (${fake})`);
  const fakePaypal = new URL("https://pаypal.com").hostname;
  ok(localVerdict(`https://${fakePaypal}`, base).status === "unsafe", `brand look-alike (${fakePaypal})`);
  ok(localVerdict("https://revtype-login.com", base).status === "suspicious", "our name on another domain is flagged only");
  ok(localVerdict("https://www.revtype.com/tasks", base).status === "ok", "our own domain is ok");
  ok(localVerdict("https://192.168.1.10", { ...base, mode: "off" }).status === "ok", "mode off skips heuristics");

  console.log("extraction");
  const text = "see example.com/a, and https://Evil.example/x. also www.site.org! mail bob@corp.com javascript:alert(1)";
  const found = extractUrls(text);
  ok(found.includes("https://example.com/a"), "bare domain with path");
  ok(found.includes("https://Evil.example/x"), "scheme URL, trailing dot stripped");
  ok(found.includes("https://www.site.org"), "www host");
  ok(!found.some((u) => u.includes("corp.com")), "email not a link");
  ok(!found.some((u) => u.startsWith("javascript")), "javascript: in prose is not a link");
  const html = extractUrlsFromHtml(
    '<p>hi <a href="javascript:alert(1)">x</a> <a href="/local">y</a> <a href="https://a.test/p">z</a> see b.com/x <img src="data:image/png;base64,AA"></p>'
  );
  ok(html.includes("javascript:alert(1)"), "html: javascript: href caught");
  ok(html.includes("https://a.test/p") && html.includes("https://b.com/x"), "html: href + text links");
  ok(!html.some((u) => u.includes("/local") || u.startsWith("data:")), "html: relative hrefs and img src ignored");

  console.log("setting guard");
  ok(validateSettingValues({ "security.blocked_domains": ["bad.com", "", "  "] }).length === 0, "blank lines allowed");
  ok(validateSettingValues({ "security.blocked_domains": ["not a domain"] }).length === 1, "junk refused");
  ok(validateSettingValues({ "security.link_policy": "nope" }).length === 1, "unknown mode refused");
  ok(validateSettingValues({ "security.link_policy": "flag" }).length === 0, "flag accepted");

  console.log("enforcement");
  const hard = localVerdict("javascript:x", base);
  const unsafe = { ...localVerdict("https://a.com", base), status: "unsafe" as const };
  const susp = localVerdict("http://1.2.3.4", base);
  ok(refuses(hard, "flag", "full") && refuses(hard, "off", "full"), "hard refused on user content in every mode");
  ok(refuses(hard, "flag", "hard-only"), "hard refused in chat");
  ok(!refuses(hard, "block", "never"), "admin surfaces never refused");
  ok(!refuses(unsafe, "flag", "full"), "unsafe allowed in flag mode");
  ok(refuses(unsafe, "block", "full"), "unsafe refused in block mode");
  ok(!refuses(unsafe, "block", "hard-only"), "unsafe only flagged in chat");
  ok(!refuses(susp, "block", "full"), "raw IP never refused");

  console.log("Safe Browsing (injected fetch)");
  const cfgSB: LinkSafetyConfig = { ...base, safeBrowsingKey: "k" };
  clearLinkSafetyCache();
  let calls = 0;
  const hitFetch = (async (_u: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const entries = body.threatInfo.threatEntries as { url: string }[];
    return new Response(
      JSON.stringify({
        matches: entries
          .filter((e) => e.url.includes("malware.test"))
          .map((e) => ({ threatType: "SOCIAL_ENGINEERING", threat: { url: e.url } })),
      }),
      { status: 200 }
    );
  }) as typeof fetch;
  const v1 = await checkUrls(["https://malware.test/x", "https://fine.test"], { config: cfgSB, fetch: hitFetch });
  ok(v1[0].status === "unsafe" && v1[0].threats?.[0] === "SOCIAL_ENGINEERING", "hit marked unsafe");
  ok(v1[1].status === "ok", "miss is ok");
  ok(calls === 1, "one batched request");
  await checkUrls(["https://malware.test/x"], { config: cfgSB, fetch: hitFetch });
  ok(calls === 1, "second lookup served from cache");

  clearLinkSafetyCache();
  const throwing = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const v2 = await checkUrls(["https://malware.test/x"], { config: cfgSB, fetch: throwing });
  ok(v2[0].status === "ok", "fail open when fetch throws");
  const http500 = (async () => new Response("err", { status: 500 })) as typeof fetch;
  const v3 = await checkUrls(["https://malware.test/x"], { config: cfgSB, fetch: http500 });
  ok(v3[0].status === "ok", "fail open on HTTP 500");
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })) as typeof fetch;
  const t0 = Date.now();
  const v4 = await checkUrls(["https://slow.test"], { config: cfgSB, fetch: hang });
  ok(v4[0].status === "ok" && Date.now() - t0 < 7000, "fail open after the 5s timeout");

  console.log("screenLinks");
  clearLinkSafetyCache();
  const r1 = await screenLinks(
    { texts: ["hello https://malware.test/x"] },
    { entityType: "post" },
    { config: { ...cfgSB, mode: "block" }, fetch: hitFetch }
  );
  ok(!r1.ok && /can't be posted/.test(r1.message ?? ""), "block mode refuses with a message");
  const r2 = await screenLinks(
    { texts: ["hello https://malware.test/x"] },
    { entityType: "post" },
    { config: cfgSB, fetch: hitFetch }
  );
  ok(r2.ok && r2.flagged.length === 1, "flag mode allows and flags");
  const r3 = await screenLinks({ urls: ["javascript:alert(1)"] }, { entityType: "ad" }, { config: base });
  ok(!r3.ok, "javascript: link field refused");
  const r4 = await screenLinks({ urls: ["javascript:alert(1)"] }, { entityType: "cpa", enforcement: "never" }, { config: base });
  ok(r4.ok && r4.flagged.length === 1, "admin surface only flags");
  const r5 = await screenLinks({ texts: ["no links here"] }, { entityType: "post" }, { config: base });
  ok(r5.ok && r5.verdicts.length === 0, "no links, nothing to do");
  const r6 = await screenLinks({ texts: ["try javascript:alert(1) in the console"] }, { entityType: "post" }, { config: base });
  ok(r6.ok, "prose mentioning javascript: is not refused");

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  // raiseAbuseSignal is fire-and-forget; it may try to load the DB module.
  // Exit explicitly so a pending import cannot hold the process open.
  process.exit(failed === 0 ? 0 : 1);
}

main();
