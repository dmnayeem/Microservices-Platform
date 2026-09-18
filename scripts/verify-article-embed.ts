import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

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
    const cfg = read("src/app/api/article-tasks/[taskId]/embed-config/route.ts");
    // The real function, with only its signature's type annotations removed so
    // it can be executed. The body is untouched, which is the point — these
    // assertions are on the shipped logic, not a copy of it.
    const fnSrc = extractFunction(cfg, "appendToken").replace(
      /^function appendToken\([^)]*\)\s*:\s*\w+/,
      "function appendToken(url, token)"
    );
    check("the helper is executable once its types are stripped", !/:\s*string/.test(fnSrc.split("\n")[0]));
    const appendToken = new Function(
      `${fnSrc} return appendToken;`
    )() as (url: string, token: string) => string;

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
    // The server side must keep using the request's own origin — the script is
    // served from wherever it was fetched, and hardcoding would break previews.
    check(
      "the served script still resolves its own origin from the request",
      /req\.nextUrl\.origin/.test(routeSrc)
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
