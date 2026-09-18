import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { appendArticleToken } from "../src/lib/article-task-token";
import { renderedPopupCount } from "../src/lib/article-tasks";
import { authConfig } from "../src/lib/auth/config";

/**
 * Article embed — the cross-domain Unique Key Pool script.
 *
 * Three things the owner reported, each of which looks identical from the
 * outside ("the popup doesn't work") and each of which had a different cause:
 *
 *  1. The snippet the admin copies was built from `window.location.origin`,
 *     so an admin working on localhost pasted a `http://localhost:3000/...`
 *     script tag into a live website, where it can never load.
 *  2. `appendToken` concatenated `?eg=` onto the page URL naively. On a URL
 *     with a `#fragment` the query landed *inside* the fragment, so
 *     `searchParams.get('eg')` was null on page 2 onward and the embed went
 *     silent with no error.
 *  3. The admin's position dropdown was never actually obeyed: the dodge-the-ad
 *     jitter ran on the first attempt too, so every popup landed ±60px off the
 *     chosen fraction whether or not there was anything in the way.
 *
 * The position rule is the one most likely to be undone by a later edit — it
 * reads like a one-line simplification to hoist the jitter back out of its
 * guard — so it is not asserted from the source text. The real function is
 * lifted out of the route's template literal and executed against stub
 * geometry, and the assertion is on where the popup actually lands.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-article-embed.ts
 */

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const ROUTE = "src/app/embed/article.js/route.ts";

/**
 * Pull one `function name(...) { ... }` out of the route source by matching
 * braces, and undo the two escapes a TS template literal requires so the text
 * is runnable JavaScript again.
 */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in ${ROUTE}`);
  let depth = 0;
  let i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`unbalanced braces in ${name}`);
  return src
    .slice(start, i + 1)
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${");
  void open;
}

function main() {
  console.log("\n=== Article embed ===\n");

  const routeSrc = read(ROUTE);

  /* ── 1. The popup lands where the admin said ── */
  console.log("1. The admin's chosen position is honoured");
  {
    // The fraction table lives beside the function; take it from the source
    // too, so a change to the slot values is caught by the same assertions.
    const tableMatch = routeSrc.match(/var POSITION_FRACTIONS = \{[\s\S]*?\};/);
    const zoneMatch = routeSrc.match(/var POSITION_TO_ZONE = \{[\s\S]*?\};/);
    check("the position tables are still in the script", !!tableMatch && !!zoneMatch);

    const fnSrc = extractFunction(routeSrc, "computePosition");

    // Stub geometry: an article at document y=1000, 2000px tall, 800px wide,
    // starting at x=100. Deliberately not round-numbered against the
    // fractions so an off-by-one in the maths cannot coincidentally pass.
    const ARTICLE_TOP = 1000;
    const ARTICLE_H = 2000;
    const ARTICLE_LEFT = 100;
    const ARTICLE_W = 800;

    const harness = `
      ${tableMatch?.[0]}
      ${zoneMatch?.[0]}
      var window = { pageYOffset: 0, pageXOffset: 0 };
      var document = { documentElement: { scrollTop: 0, scrollLeft: 0 } };
      function getArticleRoot() {
        return { getBoundingClientRect: function() {
          return { top: ${ARTICLE_TOP}, left: ${ARTICLE_LEFT},
                   height: ${ARTICLE_H}, width: ${ARTICLE_W} };
        } };
      }
      function pickRandomSlot() { return 'middle'; }
      var ZONES = [];
      function zonesOverlap(y) {
        for (var i = 0; i < ZONES.length; i++) {
          if (y >= ZONES[i][0] && y <= ZONES[i][1]) return true;
        }
        return false;
      }
      ${fnSrc}
      return { computePosition: computePosition, setZones: function(z) { ZONES = z; } };
    `;
    const api = new Function(harness)() as {
      computePosition: (
        pos: string,
        prevZone: number | null,
        adZones: unknown
      ) => { top: number; left: number; zone: number };
      setZones: (z: number[][]) => void;
    };

    const expected: Record<string, number> = {
      top: 0.1,
      quarter: 0.3,
      middle: 0.5,
      "three-quarter": 0.7,
      bottom: 0.88,
    };

    // No ad zones at all: every run must land on the exact fraction. Repeat,
    // because the bug this guards against was *random* — a single sample of a
    // jittering implementation lands on the right answer 1 time in 120.
    api.setZones([]);
    for (const [slot, fraction] of Object.entries(expected)) {
      const want = Math.round(ARTICLE_TOP + fraction * ARTICLE_H);
      let worst = 0;
      for (let n = 0; n < 200; n++) {
        const got = api.computePosition(slot, null, []).top;
        worst = Math.max(worst, Math.abs(got - want));
      }
      check(
        `"${slot}" lands exactly at ${(fraction * 100).toFixed(0)}% of the article, every time`,
        worst === 0,
        `drifted by up to ${worst}px over 200 runs`
      );
    }

    // …but the dodge must still work when an ad really is in the way.
    const middleY = ARTICLE_TOP + 0.5 * ARTICLE_H;
    api.setZones([[middleY - 20, middleY + 20]]);
    let moved = 0;
    let stillInside = 0;
    for (let n = 0; n < 200; n++) {
      const got = api.computePosition("middle", null, [1]).top;
      if (got !== Math.round(middleY)) moved++;
      if (got >= middleY - 20 && got <= middleY + 20) stillInside++;
    }
    check(
      "a popup whose slot is covered by an ad is moved off it",
      moved === 200,
      `${200 - moved} of 200 runs stayed on the ad`
    );
    check(
      "…and the offset it picks is genuinely clear of the ad",
      stillInside === 0,
      `${stillInside} of 200 runs landed back inside the ad zone`
    );

    // The horizontal centre must stay inside the article, or the badge hangs
    // off the edge of a narrow column.
    api.setZones([]);
    let outside = 0;
    for (let n = 0; n < 200; n++) {
      const { left } = api.computePosition("middle", null, []);
      if (left < ARTICLE_LEFT || left > ARTICLE_LEFT + ARTICLE_W) outside++;
    }
    check("the popup's centre stays within the article's width", outside === 0, `${outside}/200`);
  }

  /* ── 2. It stays on screen after layout ── */
  console.log("\n2. A badge that lands off-screen is rescued");
  {
    // `left` is a CENTRE (translateX(-50%)) jittered across the middle 40% of
    // the article, which on a phone is enough to push a wide badge past the
    // right edge, where it is clipped and cannot be tapped. Both corrections
    // need the real box, so both live in the post-layout frame.
    const raf = routeSrc.match(/requestAnimationFrame\(function\(\) \{[\s\S]*?\n {4}\}\);/);
    check("the post-layout rescue is still there", !!raf);
    const body = raf?.[0] ?? "";
    check(
      "it clamps the badge horizontally into the viewport",
      /clientWidth/.test(body) && /setProperty\('left'/.test(body)
    );
    check(
      "the horizontal clamp runs before the vertical early-return",
      body.indexOf("clientWidth") < body.indexOf("if (!invisible && !pastEnd) return;"),
      "an in-document badge would skip the clamp and stay clipped"
    );
    check(
      "an unreachable badge is still pinned to the viewport corner",
      /setProperty\('position', 'fixed'/.test(body)
    );
  }

  /* ── 3. The token survives the URL it is appended to ── */
  console.log("\n3. The page token survives every URL shape");
  {
    // One implementation, imported and run for real. It used to exist twice —
    // and after the copy in embed-config was fixed, the copy in the start
    // route (the reader's FIRST link, so the one that mattered most) still
    // mangled fragment URLs and stacked duplicate tokens.
    const appendToken = appendArticleToken;
    for (const f of [
      "src/app/api/article-tasks/[taskId]/start/route.ts",
      "src/app/api/article-tasks/[taskId]/embed-config/route.ts",
    ]) {
      check(
        `${f.split("/").slice(-2)[0]} uses the shared helper, not a local copy`,
        /appendArticleToken\(/.test(read(f)) && !/function appendToken\(/.test(read(f))
      );
    }

    const cases: Array<[string, string, string]> = [
      ["a plain URL", "https://site.com/a", "eg=TOK"],
      ["a URL that already has a query", "https://site.com/a?x=1", "eg=TOK"],
      ["a URL with a fragment", "https://site.com/a#part2", "eg=TOK"],
      ["a URL with both", "https://site.com/a?x=1#part2", "eg=TOK"],
    ];
    for (const [label, url, want] of cases) {
      const out = appendToken(url, "TOK");
      const qs = out.split("#")[0];
      check(`${label} carries the token in the query`, qs.includes(want), out);
    }
    // The fragment itself must survive — losing it changes which page of a
    // multi-page article the reader lands on.
    check(
      "the fragment is preserved",
      appendToken("https://site.com/a#part2", "TOK").endsWith("#part2")
    );
    // Re-entry must not stack `eg=` copies; the last one would win and the
    // URL grows on every hop through the pool.
    const twice = appendToken(appendToken("https://site.com/a", "ONE"), "TWO");
    check(
      "re-appending replaces the old token instead of duplicating it",
      (twice.match(/eg=/g) ?? []).length === 1 && twice.includes("eg=TWO"),
      twice
    );
  }

  /* ── 4. The snippet the admin copies is pasteable ── */
  console.log("\n4. The generated snippet points at the real site");
  {
    const builder = read("src/app/admin/tasks/_components/ArticleTaskBuilder.tsx");
    check(
      "the snippet's origin comes from NEXT_PUBLIC_APP_URL, not the admin's address bar",
      /process\.env\.NEXT_PUBLIC_APP_URL/.test(builder),
      "window.location.origin bakes localhost into a snippet meant for a live site"
    );
    check(
      "the admin is warned when that origin is still local",
      /originIsLocal/.test(builder)
    );
    // The server side must keep using the request's own origin for its own
    // fetches — that is where the session and the CORS answer are, and it is
    // what lets a local test talk to a local server.
    check(
      "the script's API base still comes from the request's origin",
      /req\.nextUrl\.origin/.test(routeSrc)
    );
  }

  /* ── 5. The reader is sent to the real site ── */
  console.log("\n5. The submit link points at the public site, not localhost");
  {
    // The two origins must stay separate. Collapsing them either sends the
    // reader to localhost (what the owner saw) or sends our fetches to
    // production from a dev box.
    check(
      "the reader-facing link uses APP_ORIGIN, not the API origin",
      /var taskPageUrl = APP_ORIGIN \+ '\/article-tasks\/'/.test(routeSrc),
      "the key-reveal card is the only thing the reader clicks through"
    );
    check(
      "fetches still use ORIGIN",
      /fetch\(ORIGIN \+ '\/api\/article-tasks\//.test(routeSrc)
    );

    const fnSrc = extractFunction(routeSrc, "publicOrigin").replace(
      /^function publicOrigin\([^)]*\)\s*:\s*\w+/,
      "function publicOrigin(fallback)"
    );
    const makeResolver = (envValue: string | undefined) =>
      new Function(
        "env",
        `var process = { env: env }; ${fnSrc} return publicOrigin;`
      )({ NEXT_PUBLIC_APP_URL: envValue }) as (fallback: string) => string;

    const FALLBACK = "https://from-the-request.example";
    const cases: Array<[string, string | undefined, string]> = [
      ["a configured production URL wins", "https://earngpt.app", "https://earngpt.app"],
      ["a trailing slash is trimmed", "https://earngpt.app/", "https://earngpt.app"],
      ["surrounding whitespace is tolerated", "  https://earngpt.app  ", "https://earngpt.app"],
      // Each of these would produce a link worse than the fallback, so the
      // fallback has to win rather than the env being trusted blindly.
      ["an unset env falls back", undefined, FALLBACK],
      ["an empty env falls back", "", FALLBACK],
      ["a localhost env falls back", "http://localhost:3000", FALLBACK],
      ["a 127.0.0.1 env falls back", "http://127.0.0.1:3000", FALLBACK],
      ["a non-http scheme falls back", "ftp://earngpt.app", FALLBACK],
      ["an unparseable value falls back", "earngpt.app", FALLBACK],
    ];
    for (const [label, env, want] of cases) {
      const got = makeResolver(env)(FALLBACK);
      check(label, got === want, `got ${got}`);
    }
  }

  /* ── 6. One popup count ── */
  console.log("\n6. The count drawn and the count required are the same number");
  {
    // The bug the owner hit: an admin set popupCount=2 and wrote one popup.
    // The embed drew the one, the server waited for two, the page never
    // completed and the unique key was never issued — which from the outside
    // reads as "the popups don't work".
    type P = Parameters<typeof renderedPopupCount>[0];
    const page = (popupCount: number, texts: string[]): P =>
      ({
        url: "https://x.test/a",
        popupCount,
        popups: texts.map((t) => ({ text: t })),
      }) as unknown as P;

    check(
      "a defined popup list wins over a stale popupCount",
      renderedPopupCount(page(2, ["Click me"])) === 1
    );
    check("…and the other way round too", renderedPopupCount(page(1, ["a", "b", "c"])) === 3);
    check(
      "a popup with no text is not counted — the embed drops those",
      renderedPopupCount(page(5, ["real", "  ", ""])) === 1
    );
    check(
      "a legacy page with no popups array falls back to popupCount",
      renderedPopupCount({ url: "https://x.test/a", popupCount: 3 } as unknown as P) === 3
    );
    check(
      "a page that asks for none still means none",
      renderedPopupCount({ url: "https://x.test/a", popupCount: 0 } as unknown as P) === 0,
      "pages with no popups are auto-complete; making them 1 would deadlock the journey"
    );

    // The two routes that DECIDE whether a page is finished must never read
    // the raw field again — that is the regression that deadlocked the
    // journey, and it looks like a harmless simplification in review.
    for (const f of ["popup-progress", "generate-key"]) {
      const src = read(`src/app/api/article-tasks/[taskId]/${f}/route.ts`);
      check(
        `${f} counts popups through the shared helper`,
        /renderedPopupCount\(/.test(src) && !/\bpage(Def|s\[\w+\])?\.popupCount\b/.test(src),
        "a raw popupCount here is what made the page impossible to finish"
      );
    }
    {
      // embed-config still reads the raw field, legitimately: it is the
      // fallback that synthesises placeholder popups for a legacy page that
      // has no `popups` array. What it must not do is REPORT a different
      // number than it draws.
      const src = read("src/app/api/article-tasks/[taskId]/embed-config/route.ts");
      check(
        "embed-config reports the rendered count",
        /popupCount: renderedPopupCount\(page\)/.test(src)
      );
      check(
        "…and its only raw use is the legacy placeholder synthesis",
        (src.match(/\bpage\.popupCount\b/g) ?? []).length === 2 &&
          /Array\.from\(\{ length: page\.popupCount \}/.test(src)
      );
    }
  }

  /* ── 7. Nothing fails in silence ── */
  console.log("\n7. A failure says why");
  {
    const src = read(ROUTE);
    check("there is a console logger", /function log\(msg, extra\)/.test(src));
    check(
      "a missing token explains itself instead of returning silently",
      /no "eg" token in the page URL/.test(src)
    );
    check(
      "a refused config tells the reader",
      /maybeNotice\(/.test(src) && /This article link has expired/.test(src)
    );
    // The article the owner is actually using carries two tasks' snippets, so
    // one of them always gets a 403. It has to stay quiet, or it would tell a
    // reader the link is broken while the task runs fine beside it.
    check(
      "a snippet for a different task stays quiet",
      /if \(res\.status === 403\) return;/.test(src)
    );
    check(
      "…and any other failure first waits to see whether another snippet won",
      /window\.__egAtLoaded/.test(src) && /function maybeNotice/.test(src)
    );
  }

  /* ── 8. Starting the journey needs no browser permission ── */
  console.log("\n8. The article opens without a popup-blocker prompt");
  {
    const src = read("src/components/user/tasks/article-task-detail-view.tsx");
    // window.open AFTER an await has lost the user's gesture, and every popup
    // blocker stops it — the reader gets a permission prompt instead of the
    // article. The tab has to be opened while the click is still in scope.
    // Scoped to this card's own body — the file holds several other cards
    // that fetch, and comparing against the first `await fetch(` in the whole
    // file would compare against one of theirs.
    const card = src.slice(src.indexOf("function KeyPoolStartCard"));
    const body = card.slice(0, card.indexOf("\n  return ("));
    const openAt = body.indexOf('const tab = window.open("", "_blank")');
    check(
      "the tab is opened during the click, before the token round-trip",
      openAt >= 0 && openAt < body.indexOf("await fetch("),
      "opening after the fetch is what triggered the blocker"
    );
    check(
      "the blank tab is then navigated to the article",
      /tab\.location\.replace\(url\)/.test(src)
    );
    check(
      "a blocked tab falls back to a real link the reader clicks",
      /setBlocked\(true\)/.test(src) && /Open the article/.test(src)
    );
    check(
      "reopening reuses the same journey instead of minting a second token",
      /if \(articleUrl\) \{/.test(src)
    );
  }

  /* ── 9. The embed is reachable from someone else's website ── */
  console.log("\n9. A third-party page can actually load the embed");
  {
    // This is why the feature had never worked anywhere but the admin's own
    // machine. In production the middleware sent /embed/article.js and all
    // three embed APIs to /login with a 307, so the script tag on a real
    // article downloaded a redirect instead of JavaScript. Locally it looked
    // perfect, because middleware does not run under `next dev` on Next 16 —
    // which is also why this has to be asserted by calling the callback
    // directly rather than by fetching the dev server.
    //
    // A session could never have authenticated these anyway: the script tag
    // and its fetches are cross-site, so the SameSite=Lax cookie is not sent
    // even for a reader signed in here. That is the phone case too.
    type Req = { nextUrl: URL };
    const authorized = authConfig.callbacks?.authorized as unknown as
      | ((p: { auth: unknown; request: Req }) => boolean | Response)
      | undefined;
    check("the auth config still exposes an authorized callback", !!authorized);

    const verdict = (path: string, signedIn = false) => {
      const r = authorized!({
        auth: signedIn ? { user: { id: "u1" } } : null,
        request: { nextUrl: new URL(`https://earngpt.app${path}`) },
      });
      return r === true ? "allow" : r === false ? "deny" : "redirect";
    };

    for (const p of [
      "/embed/article.js",
      "/api/article-tasks/abc/embed-config",
      "/api/article-tasks/abc/popup-progress",
      "/api/article-tasks/abc/generate-key",
    ]) {
      check(`a signed-out third-party reader may reach ${p}`, verdict(p) === "allow");
    }

    // The other half of the rule. `start` mints the token that authenticates
    // everything above, so it must keep demanding a real session — opening it
    // would let anyone mint a journey token for any task.
    check(
      "…but /start still requires a session",
      verdict("/api/article-tasks/abc/start") === "deny",
      "start is what issues the token; it cannot be public"
    );
    check("and ordinary pages are untouched", verdict("/dashboard") === "deny");
    check("and admin is untouched", verdict("/admin") === "deny");
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
