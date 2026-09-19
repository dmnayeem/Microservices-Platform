import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import {
  nextChromeState,
  TOLERANCE,
  REVEAL_AT,
} from "../src/lib/use-chrome-autohide";

/**
 * Feed chrome auto-hide — scroll down and the bars get out of the way, scroll
 * up and they come straight back.
 *
 * Three bars move: the app header, the feed's filter toolbar, and the bottom
 * tab bar. They live in three different components, so the state is one data
 * attribute on `<html>` and CSS does the moving — a scroll must not re-render
 * the feed's component tree, and the bars must not need props threaded through
 * every page that renders them.
 *
 * Almost all of the risk here is in the thresholds, which is why they are a
 * pure function rather than lines buried in an effect. Drop the tolerance and
 * the bars flicker under a resting finger and at the rubber-band end of a
 * list; drop the reveal band and scrolling back to the top leaves the reader
 * on the first post with no header and no way to compose.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-chrome-autohide.ts
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

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

function main() {
  console.log("\n=== Feed chrome auto-hide ===\n");

  /* ── 1. The gesture ── */
  console.log("1. Down hides, up shows");
  {
    const far = REVEAL_AT + 500;
    check(
      "scrolling down past the reveal band hides the chrome",
      nextChromeState({ y: far + 40, lastY: far, hidden: false }).hidden === true
    );
    check(
      "scrolling up shows it again",
      nextChromeState({ y: far, lastY: far + 40, hidden: true }).hidden === false
    );
    // One flick up must be enough. A design that needed several would feel
    // like the header was fighting the reader.
    check(
      "a single upward flick is enough",
      nextChromeState({ y: far - TOLERANCE, lastY: far, hidden: true }).hidden === false
    );
  }

  /* ── 2. The thresholds ── */
  console.log("\n2. It does not flicker");
  {
    const far = REVEAL_AT + 500;
    // A finger resting on the glass moves the page a pixel at a time. Without
    // the tolerance each of those is a direction change.
    for (const jitter of [0, 1, -1, TOLERANCE - 1, -(TOLERANCE - 1)]) {
      const r = nextChromeState({ y: far + jitter, lastY: far, hidden: false });
      check(
        `a ${jitter}px twitch changes nothing`,
        r.commit === false && r.hidden === false
      );
    }
    // …and the state it reports back is whatever it already was, so a hidden
    // bar stays hidden through the same jitter rather than flashing back.
    check(
      "a twitch while hidden leaves it hidden",
      nextChromeState({ y: far + 1, lastY: far, hidden: true }).hidden === true
    );
    check(
      `${TOLERANCE}px is enough to count as a gesture`,
      nextChromeState({ y: far + TOLERANCE, lastY: far, hidden: false }).commit === true
    );

    // The caller only advances its baseline on a committed move. Simulating
    // the real loop proves a slow drag still registers instead of creeping
    // under the tolerance forever.
    let lastY = far;
    let hidden = false;
    for (let i = 1; i <= 20; i++) {
      const y = far + i * 2; // 2px a frame — below the tolerance every frame
      const r = nextChromeState({ y, lastY, hidden });
      if (r.commit) {
        lastY = y;
        hidden = r.hidden;
      }
    }
    check(
      "a slow drag still adds up to a gesture",
      hidden === true,
      "advancing the baseline every frame would make a slow scroll never register"
    );
  }

  /* ── 3. The top of the page ── */
  console.log("\n3. The top of the feed always has its chrome");
  {
    check(
      "at the very top the chrome is shown",
      nextChromeState({ y: 0, lastY: 999, hidden: true }).hidden === false
    );
    check(
      "…and anywhere inside the reveal band",
      nextChromeState({ y: REVEAL_AT, lastY: 0, hidden: true }).hidden === false
    );
    // The important one: still shown even though this is a DOWNWARD scroll.
    // Without it, the first flick on a freshly-loaded feed takes the header
    // away before the reader has seen it.
    check(
      "even when the gesture was downward",
      nextChromeState({ y: REVEAL_AT - 1, lastY: 0, hidden: false }).hidden === false
    );
    check(
      "just past the band, a downward scroll hides again",
      nextChromeState({ y: REVEAL_AT + TOLERANCE + 1, lastY: REVEAL_AT, hidden: false })
        .hidden === true
    );
  }

  /* ── 4. All three bars are wired ── */
  console.log("\n4. Every bar the reader sees is tagged");
  {
    // `app-chrome` is on both the header and the tab bar, so it cannot say
    // which is which — the data attribute is what the CSS keys off.
    const bars: Array<[string, string]> = [
      ["the app header", "src/components/dashboard/header.tsx"],
      ["the bottom tab bar", "src/components/dashboard/bottom-tab-bar.tsx"],
      ["the feed toolbar", "src/components/user/feed/social-feed-view.tsx"],
    ];
    const kinds = ["top", "bottom", "toolbar"];
    bars.forEach(([label, file], i) => {
      check(`${label} is tagged data-chrome="${kinds[i]}"`,
        new RegExp(`data-chrome="${kinds[i]}"`).test(read(file)));
    });
    check(
      "the feed mounts the hook",
      /useChromeAutoHide\(\)/.test(read("src/components/user/feed/social-feed-view.tsx"))
    );
  }

  /* ── 5. The CSS that actually moves them ── */
  console.log("\n5. The movement is CSS, on phones and tablets only");
  {
    const css = read("src/app/globals.css");
    const block = css.slice(css.indexOf("Chrome auto-hide"));
    check("the auto-hide block exists", block.length > 0);
    check(
      "it is gated below lg, so a laptop keeps its header",
      /@media \(max-width: 1023px\)/.test(block),
      "a disappearing header beside a persistent sidebar reads as a glitch"
    );
    check(
      "the header slides up and the tab bar slides down",
      /\[data-chrome="top"\]\s*\{\s*transform: translateY\(-100%\)/.test(block) &&
        /\[data-chrome="bottom"\]\s*\{\s*transform: translateY\(100%\)/.test(block)
    );
    // The toolbar is sticky 4rem down the page, so its own height is not
    // enough to clear the screen — it would stop halfway and hang there.
    check(
      "the toolbar clears the gap above it, not just its own height",
      /translateY\(calc\(-100% - 4rem - env\(safe-area-inset-top\)\)\)/.test(block),
      "translateY(-100%) alone leaves it stuck to the top edge"
    );
    check(
      "a hidden toolbar cannot be clicked",
      /pointer-events: none/.test(block)
    );
    check(
      "reduced motion drops the animation",
      /prefers-reduced-motion: reduce/.test(block)
    );

    // The hook must leave nothing behind, or every page navigated to from the
    // feed inherits a hidden header with no scroll listener to restore it.
    const hook = read("src/lib/use-chrome-autohide.ts");
    check(
      "unmounting clears the attribute",
      /return \(\) => \{[\s\S]*delete root\.dataset\.chromeHidden/.test(hook)
    );
    check(
      "scroll is coalesced to one measurement a frame",
      /requestAnimationFrame\(measure\)/.test(hook) && /if \(frame\) return;/.test(hook)
    );
    check(
      "the scroll listener is passive",
      /\{ passive: true \}/.test(hook),
      "a non-passive scroll listener blocks the compositor and makes the feed stutter"
    );
    check(
      "focus brings the bars back",
      /focusin/.test(hook),
      "a control inside hidden chrome cannot be reached from a keyboard"
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
