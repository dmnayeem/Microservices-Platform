/**
 * verify-responsive — the layout rules that only fail on somebody else's phone.
 *
 * Every check here is for a break that is invisible on the machine it was
 * written on. A 390px phone, a 320px phone, a long German word, a wallet
 * address, a user whose display name is forty characters: each of these is a
 * real visitor, and none of them is the browser window the code was typed in.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-responsive.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Every user-facing .tsx. The admin panel is out of scope by instruction. */
function userFacing(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "admin") continue;
        walk(rel);
      } else if (e.name.endsWith(".tsx")) out.push(rel);
    }
  };
  walk("src/app");
  walk("src/components");
  return out.sort();
}

const FILES = userFacing();

/** Every class list in a file, with its line number. */
function classLists(file: string): { line: number; cls: string }[] {
  const out: { line: number; cls: string }[] = [];
  const src = read(file);
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/class(?:Name)?="([^"]*)"/g)) {
      out.push({ line: i + 1, cls: m[1] });
    }
  });
  return out;
}

const ALL: { file: string; line: number; cls: string }[] = [];
for (const f of FILES) for (const c of classLists(f)) ALL.push({ file: f, ...c });

console.log(`\nverify-responsive — ${FILES.length} user-facing files, ${ALL.length} class lists\n`);

/* ══════════════════════════════════════════════════════════════════════════
   1. Shrinkable flex and grid children
   ══════════════════════════════════════════════════════════════════════════
   A flex item's min-width defaults to `auto`, meaning "never narrower than my
   content". So a row holding a long name refuses to shrink and pushes the card
   wider than the screen — and `truncate` on that child does nothing at all,
   because the box it is truncating inside never gets smaller. `min-w-0` is the
   opt-out, and it has to be on the flex CHILD, not the row. */
{
  const offenders = ALL.filter(({ cls }) => {
    const has = (t: string) => new RegExp(`(?<![-\\w:])${t}(?![-\\w])`).test(cls);
    const truncating = has("truncate") || /(?<![-\w:])line-clamp-\d(?![-\w])/.test(cls);
    return truncating && has("flex-1") && !cls.includes("min-w-0");
  });
  check(
    "every truncating flex child may actually shrink (min-w-0)",
    offenders.length === 0,
    offenders.map((o) => `${o.file}:${o.line}`).join(", ")
  );
}

/* A `1fr` grid column carries the same implicit `auto` minimum. A wide table,
   a code block or one long word inside it widens the whole grid. */
{
  const offenders = ALL.filter(({ cls }) => {
    for (const m of cls.matchAll(/grid-cols-\[([^\]]+)\]/g)) {
      const tpl = m[1];
      if (/(^|_)\d*(\.\d+)?fr/.test(tpl) && !tpl.includes("minmax(0")) return true;
    }
    return false;
  });
  check(
    "explicit grid templates let their fr columns shrink (minmax(0,…))",
    offenders.length === 0,
    offenders.map((o) => `${o.file}:${o.line}`).join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Nothing wider than the narrowest phone we support
   ══════════════════════════════════════════════════════════════════════════
   320px is a live width (iPhone SE 1, Galaxy Fold closed). A fixed width at or
   above it, with no cap and no breakpoint prefix, is wider than the viewport
   on those devices. */
{
  const NARROWEST = 320;
  const offenders: string[] = [];
  for (const { file, line, cls } of ALL) {
    for (const m of cls.matchAll(/(?<![-\w:])(?:(\w+):)?(?:min-)?w-\[(\d+)px\]/g)) {
      const breakpoint = m[1];
      const px = Number(m[2]);
      if (breakpoint) continue; // only applies above that breakpoint
      if (px >= NARROWEST && !cls.includes("max-w-")) {
        offenders.push(`${file}:${line} (w-[${px}px])`);
      }
    }
  }
  check(
    `no unconditional fixed width reaches the narrowest phone (${NARROWEST}px)`,
    offenders.length === 0,
    offenders.join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Long unbroken strings
   ══════════════════════════════════════════════════════════════════════════
   A wallet address, a referral URL and a long email are each ONE word, and one
   word cannot be wrapped by normal rules. The page is protected by
   `overflow-x: hidden`, but the card the word sits in is not: it stretches or
   clips. The global `overflow-wrap: break-word` is what makes those break. */
{
  const css = read("src/app/globals.css");
  const bodyBlocks = [...css.matchAll(/(?:^|\n)body\s*\{([^}]*)\}/g)].map((m) => m[1]);
  check(
    "a long unbroken word breaks instead of widening its card",
    bodyBlocks.some((b) => /overflow-wrap:\s*(break-word|anywhere)/.test(b)),
    "no `overflow-wrap` on body in globals.css"
  );
  check(
    "the page itself cannot scroll sideways",
    bodyBlocks.some((b) => /overflow-x:\s*hidden/.test(b))
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Touch targets
   ══════════════════════════════════════════════════════════════════════════
   A control smaller than 44px is a control the owner's users will miss. This
   has bitten here before: a `[&>button]` selector styles only DIRECT children,
   so a like button that looked padded was a 20px target in practice.

   The marker is `app-tap-row`, which means "this is a finger-sized target",
   and NOT `app-press`, which is only the press animation and is worn by
   desktop chrome too — a 36px clear button inside a desktop sidebar field is
   fine for a mouse and cannot be 44px without making the field taller than it
   should be. Mixing the two turns this check into noise, and a noisy check is
   one people learn to ignore. */
{
  const offenders: string[] = [];
  for (const { file, line, cls } of ALL) {
    const m = cls.match(/(?<![-\w:])h-(\d+)(?![-\w])/);
    if (!m) continue;
    const px = (Number(m[1]) / 4) * 16;
    const isTapTarget = /(?<![-\w:])app-tap-row(?![-\w])/.test(cls);
    if (isTapTarget && px < 44) offenders.push(`${file}:${line} (h-${m[1]} = ${px}px)`);
  }
  check(
    "controls marked as finger targets are at least 44px tall",
    offenders.length === 0,
    offenders.join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5. The bottom bar never covers what it sits over
   ══════════════════════════════════════════════════════════════════════════
   The mobile nav is fixed, and its height is not a constant: the raised Home
   tab sits above the bar's own box, so `offsetHeight` under-measures it. The
   shell therefore reserves a MEASURED height published as `--bottom-nav-h`,
   and anything sticky above the nav has to reserve it too. Getting this wrong
   is what put the submit button under the tab bar. */
{
  const nav = read("src/components/dashboard/bottom-tab-bar.tsx");
  check(
    "the bottom nav publishes its measured height",
    nav.includes("--bottom-nav-h") && /getBoundingClientRect|offsetTop/.test(nav)
  );
  check(
    "the nav re-measures when the viewport changes",
    /resize/.test(nav) && /orientationchange/.test(nav)
  );
  const shell = read("src/app/(main)/layout.tsx");
  check(
    "the app shell reserves that measured height, not a guessed constant",
    shell.includes("--bottom-nav-h")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6. Horizontal rows scroll rather than squash
   ══════════════════════════════════════════════════════════════════════════
   A row of chips, tabs or stats on a phone either scrolls or wraps. What it
   must not do is shrink each item until the labels break onto a second line,
   which is the failure the owner reported by photograph. */
{
  const offenders: string[] = [];
  for (const { file, line, cls } of ALL) {
    const isRow = /(?<![-\w:])flex(?![-\w])/.test(cls);
    const nowrapRow = /(?<![-\w:])flex-nowrap(?![-\w])/.test(cls);
    if (!isRow || !nowrapRow) continue;
    const scrolls = /overflow-x-(auto|scroll)/.test(cls);
    if (!scrolls) offenders.push(`${file}:${line}`);
  }
  check(
    "a no-wrap row can be scrolled, so its items are reachable",
    offenders.length === 0,
    offenders.join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   7. Images and media stay inside their box
   ══════════════════════════════════════════════════════════════════════════ */
{
  const css = read("src/app/globals.css");
  check(
    "a tall photo is capped by ratio rather than allowed to fill the screen",
    /aspect-ratio|max-h-\[/.test(css) ||
      ALL.some(({ cls }) => /aspect-\[/.test(cls))
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
