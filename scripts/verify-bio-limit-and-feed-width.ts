import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  BIO_WORD_LIMIT,
  BIO_CHAR_LIMIT,
  countWords,
  truncateWords,
} from "../src/lib/word-count";

/**
 * Two small things that are easy to get subtly wrong.
 *
 * The bio limit is counted in WORDS, and the form and the API have to agree —
 * a box that lets you type 90 words and a server that refuses at 70 is worse
 * than no limit, because the user only finds out after writing.
 *
 * The feed widths are load-bearing arithmetic, not taste. The rail is
 * `shrink-0`, so if the two columns ask for more than the row has, the FEED is
 * what gives way. At exactly 1280 there are 920px to divide, and that number
 * decides why the rail can only grow at 2xl.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-bio-limit-and-feed-width.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

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

console.log("\n=== Bio word limit & feed width ===\n");

/* ── 1. Counting words the way a person would ── */
console.log("1. Counting");
check("the limit is 70", BIO_WORD_LIMIT === 70);
check("empty is zero", countWords("") === 0 && countWords(null) === 0);
check("whitespace only is zero", countWords("   \n\t ") === 0);
check("one word is one", countWords("hello") === 1);
check(
  "runs of spaces do not invent words",
  countWords("hello     world") === 2,
  "a naive split(' ') counts the empty strings between them"
);
check(
  "newlines and tabs separate words too",
  countWords("one\ntwo\tthree") === 3,
  "a bio written as a list would otherwise count as one word"
);
check(
  "leading and trailing space is ignored",
  countWords("  hi there  ") === 2
);
check(
  "exactly 70 words is allowed, 71 is not",
  countWords(Array(70).fill("w").join(" ")) === 70 &&
    countWords(Array(71).fill("w").join(" ")) === 71
);

/* ── 2. Trimming keeps what was typed ── */
console.log("\n2. Trimming a long paste");
check(
  "text under the limit is returned untouched",
  truncateWords("a b c", 70) === "a b c"
);
check(
  "text over the limit is cut to exactly the limit",
  countWords(truncateWords(Array(120).fill("w").join(" "), 70)) === 70
);
check(
  "the cut keeps the original spacing of what it keeps",
  truncateWords("one\ntwo three four", 3) === "one\ntwo three",
  "rebuilding from a split would flatten the line break"
);
check("a limit of zero yields nothing", truncateWords("a b c", 0) === "");

/* ── 3. Both sides use the same rule ── */
console.log("\n3. The form and the API agree");
const api = code("src/app/api/profile/route.ts");
const form = code("src/components/user/profile/profile-edit-tabs.tsx");
check(
  "the API validates the bio on words",
  /countWords\(raw\)/.test(api) && /words > BIO_WORD_LIMIT/.test(api)
);
check(
  "…and says how far over the user is",
  /is \$\{words\} words/.test(api),
  "'bio too long' does not tell someone what to cut"
);
check(
  "the bio is NOT left in the shared 200-character loop",
  !/"lastName",\s*"bio",/.test(api),
  "70 words exceeds 200 characters, so the char check would always fire first and the word limit could never be reached"
);
check(
  "a character ceiling still bounds one enormous 'word'",
  /raw\.length > BIO_CHAR_LIMIT/.test(api) && BIO_CHAR_LIMIT > 0
);
check(
  "the form counts with the same function",
  /countWords\(form\.bio\)/.test(form)
);
check(
  "the form trims on input instead of failing at save",
  /truncateWords\(e\.target\.value, BIO_WORD_LIMIT\)/.test(form)
);
check(
  "the form's character cap matches the server's",
  /maxLength=\{BIO_CHAR_LIMIT\}/.test(form),
  "it used to be a hardcoded 500 while the server refused at 200"
);
check("the user can see the count", /\{BIO_WORD_LIMIT\} words/.test(form));

/* ── 4. Feed width arithmetic ── */
console.log("\n4. Feed and rail widths");
const view = code("src/components/user/feed/social-feed-view.tsx");
const REM = 16;
const feedXl = 42 * REM; // max-w-[42rem]
const railXl = 20 * REM; // w-80
const rail2xl = 26 * REM; // 2xl:w-[26rem]
const GAP = 24; // gap-6

check(
  "the feed is wider from xl up",
  /xl:max-w-\[42rem\]/.test(view),
  "this is the change that pulls the block left and fills the corridor"
);
check("the rail grows only at 2xl", /w-80 2xl:w-\[26rem\]/.test(view));
check("the row cap grows with it", /max-w-5xl xl:max-w-6xl/.test(view));

// 1280 is the first width where two columns fit at all: 1280 - 288 nav
// - 64 padding - 8 scrollbar = 920.
const ROW_AT_1280 = 920;
check(
  "at 1280 the feed is not squeezed below what it is today",
  ROW_AT_1280 - GAP - railXl >= 576,
  `feed would be ${ROW_AT_1280 - GAP - railXl}px`
);
check(
  "…which is exactly why the wider rail waits for 2xl",
  ROW_AT_1280 - GAP - rail2xl < 576,
  `a 416px rail at 1280 would leave the feed ${ROW_AT_1280 - GAP - rail2xl}px — narrower than today`
);
// At 2xl main is capped at max-w-7xl (1280) with lg:px-8, so 1216 of content.
const CONTENT_AT_2XL = 1216;
check(
  "at 2xl both columns fit inside main with room to spare",
  feedXl + GAP + rail2xl <= CONTENT_AT_2XL,
  `needs ${feedXl + GAP + rail2xl}px of ${CONTENT_AT_2XL}px`
);
check(
  "…and the row cap does not clip them",
  feedXl + GAP + rail2xl <= 72 * REM,
  `needs ${feedXl + GAP + rail2xl}px, max-w-6xl is ${72 * REM}px`
);
// The measured outcome this was built for.
check(
  "the dead space either side is roughly halved",
  Math.round((CONTENT_AT_2XL - (feedXl + GAP + rail2xl)) / 2) < 100,
  `${Math.round((CONTENT_AT_2XL - (feedXl + GAP + rail2xl)) / 2)}px per side, was 148px`
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
