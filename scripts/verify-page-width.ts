import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { resolveAdSize } from "../src/lib/ad-sizes";
import { placementSizeKey } from "../src/lib/ad-placements";

/**
 * Page width — the app shell must cap and centre its content.
 *
 * `(main)/layout.tsx` had padding but no `max-width`, so on a 1920px display the
 * content region was 1568px (1920 − 288 of sidebar − 64 of padding) and all 79
 * pages under it stretched to fill the screen. Only four of those pages set a
 * width of their own, so there was nothing else holding them in.
 *
 * The regression this guards against is someone editing that one className and
 * quietly removing the cap again — at which point every page in the app goes
 * back to full-bleed and nothing fails except the way it looks.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-page-width.ts
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

/** Tailwind's max-w scale, in px, for the sizes an app shell would plausibly use. */
const MAX_W_PX: Record<string, number> = {
  "max-w-sm": 384, "max-w-md": 448, "max-w-lg": 512, "max-w-xl": 576,
  "max-w-2xl": 672, "max-w-3xl": 768, "max-w-4xl": 896, "max-w-5xl": 1024,
  "max-w-6xl": 1152, "max-w-7xl": 1280,
};
const SHELL_CAP = 1280;

function main() {
  console.log("\n=== Page width ===\n");

  /* ── 1. The shell ── */
  console.log("1. The app shell caps and centres");
  {
    const layout = read("src/app/(main)/layout.tsx");
    const mainTag = layout.match(/<main\s+className="([^"]+)"/)?.[1] ?? "";
    check("the (main) layout has a <main> with a className", mainTag.length > 0);

    const cap = Object.keys(MAX_W_PX).find((c) =>
      new RegExp(`(^|\\s)${c}(\\s|$)`).test(mainTag)
    );
    check("it sets a max-width", !!cap, mainTag.slice(0, 80));
    check(
      `that max-width is the agreed 1280px (max-w-7xl), not something else`,
      cap === "max-w-7xl",
      cap ?? "none"
    );
    // Without mx-auto the cap would pin content to the left of the sidebar
    // instead of centring it, which looks worse than not capping at all.
    check("it centres with mx-auto", /(^|\s)mx-auto(\s|$)/.test(mainTag));
    check(
      "it still fills the width below the cap",
      /(^|\s)w-full(\s|$)/.test(mainTag)
    );
    // The paddings and the anchor-ad allowance must survive the edit.
    check(
      "the existing padding and anchor-ad allowance are intact",
      /px-4/.test(mainTag) &&
        /lg:px-8/.test(mainTag) &&
        /--anchor-ad-h/.test(mainTag)
    );
  }

  /* ── 2. Nothing defeats it ── */
  console.log("\n2. No page overrides the cap");
  {
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name === "page.tsx") pages.push(rel);
      }
    };
    walk("src/app/(main)");
    check(`found the (main) pages`, pages.length > 50, `${pages.length}`);

    // A page setting a WIDER max-width than the shell would silently defeat it.
    const wider: string[] = [];
    for (const p of pages) {
      const src = read(p);
      for (const [cls, px] of Object.entries(MAX_W_PX)) {
        if (px > SHELL_CAP && new RegExp(`(^|["\\s])${cls}(["\\s])`).test(src)) {
          wider.push(`${p} (${cls})`);
        }
      }
    }
    check(
      "no page under (main) sets a max-width wider than the shell",
      wider.length === 0,
      wider.join(", ")
    );

    // The two shells should agree; tutor has capped at 7xl all along and is
    // where the pattern came from.
    const tutor = read("src/components/tutor/TutorShell.tsx");
    check(
      "TutorShell still caps at the same width, so the two shells agree",
      /max-w-7xl/.test(tutor) && /mx-auto/.test(tutor)
    );
    // Owner's explicit decision — admin keeps the full width for its tables.
    check(
      "the admin shell is deliberately left uncapped",
      !/max-w-/.test(
        read("src/components/admin/layout-shell.tsx").match(/<main\s+className="([^"]+)"/)?.[1] ?? ""
      )
    );
  }

  /* ── 3. The ad card ── */
  console.log("\n3. A small creative is not marooned in a wide card");
  {
    const s = read("src/components/user/primitives/ad-renderer.tsx");
    check(
      "the LOCAL renderer falls back to the placement's width",
      /const slotDim = dim \?\? resolveAdSize\(placementSizeKey\(placement\)\)/.test(s)
    );
    check(
      "the fallback caps the card's width",
      /maxWidth: slotDim\.w/.test(s) && /mx-auto/.test(s)
    );
    // Width only. Forcing the slot's aspect ratio onto a creative that does not
    // declare one would contain a 600x200 demo down to ~270px inside a 728x90
    // box — smaller than before the fix.
    check(
      "the fallback does NOT force the slot's aspect ratio",
      s.includes("aspectRatio: `${dim.w} / ${dim.h}`") &&
        !s.includes("aspectRatio: `${slotDim")
    );

    // The behaviour that fix depends on, asserted against the real tables
    // rather than the source text.
    check(
      "a leaderboard space resolves to 728x90",
      JSON.stringify(resolveAdSize(placementSizeKey("WALLET_TOP"))) ===
        JSON.stringify({ w: 728, h: 90 })
    );
    check(
      "the article-task space resolves the same way",
      JSON.stringify(resolveAdSize(placementSizeKey("TASK_START"))) ===
        JSON.stringify({ w: 728, h: 90 })
    );
    check(
      "a rectangle space resolves to 300x250",
      JSON.stringify(resolveAdSize(placementSizeKey("TASK_COMPLETE"))) ===
        JSON.stringify({ w: 300, h: 250 })
    );
    // The important negative: a genuinely responsive space must stay
    // full-width, or in-feed ads would shrink to a fixed box mid-column.
    check(
      "an in-feed space still resolves to null, so it keeps filling its column",
      resolveAdSize(placementSizeKey("IN_FEED")) === null
    );
    // An explicit size on the creative still wins over the placement default.
    check(
      "a creative with its own size still overrides the placement",
      JSON.stringify(resolveAdSize("medium")) === JSON.stringify({ w: 300, h: 250 })
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
