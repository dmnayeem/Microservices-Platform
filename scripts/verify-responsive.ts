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

/**
 * Every .tsx, admin included.
 *
 * The redesign left the admin panel's PALETTE alone on purpose — it is its own
 * visual identity and repainting 6,349 classes was not the job. None of that
 * applies here. A grid column that cannot give way is wrong on any screen, and
 * the admin panel is opened from a phone like everything else; excluding it
 * from a structural check would only mean the owner finds those breaks by
 * photograph instead. Colour stays out of this file entirely — verify-light-
 * theme measures that, for admin too.
 */
function allTsx(): string[] {
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
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".tsx")) out.push(rel);
    }
  };
  walk("src/app");
  walk("src/components");
  return out.sort();
}

const FILES = allTsx();

/**
 * Every class list in a file, with its line number and the few lines above it.
 *
 * Comments are blanked first: a class list quoted in a doc block is an example,
 * not markup, and flagging one sends the reader to a file where nothing is
 * wrong. The preceding lines come along because some rules cannot be judged
 * from the element alone — a wide table is correct precisely when something
 * above it scrolls.
 */
function classLists(file: string): { line: number; cls: string; above: string }[] {
  const out: { line: number; cls: string; above: string }[] = [];
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const m of line.matchAll(/class(?:Name)?="([^"]*)"/g)) {
      out.push({
        line: i + 1,
        cls: m[1],
        above: lines.slice(Math.max(0, i - 4), i).join(" "),
      });
    }
  });
  return out;
}

const ALL: { file: string; line: number; cls: string; above: string }[] = [];
for (const f of FILES) for (const c of classLists(f)) ALL.push({ file: f, ...c });

console.log(`\nverify-responsive — ${FILES.length} files (admin included), ${ALL.length} class lists\n`);

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
  for (const { file, line, cls, above } of ALL) {
    for (const m of cls.matchAll(/(?<![-\w:])(?:(\w+):)?(?:min-)?w-\[(\d+)px\]/g)) {
      const breakpoint = m[1];
      const px = Number(m[2]);
      if (breakpoint) continue; // only applies above that breakpoint
      if (px < NARROWEST || cls.includes("max-w-")) continue;
      // A wide table is the one case where a fixed width is the RIGHT answer:
      // the columns keep their meaning and the row scrolls sideways instead of
      // squashing every cell to nothing. That only holds when something above
      // it actually scrolls, so this looks rather than assumes.
      if (/overflow-x-(auto|scroll)/.test(above) || /overflow-x-(auto|scroll)/.test(cls)) continue;
      offenders.push(`${file}:${line} (w-[${px}px])`);
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
/* ══════════════════════════════════════════════════════════════════════════
   8. Classes that hide from an attribute-shaped scan
   ══════════════════════════════════════════════════════════════════════════
   Half this app's shared styling lives in string constants — `const inputCls =
   "…"` — not in a className attribute. Two sweeps missed those and left 10
   dead placeholder utilities and 24 white inks behind, so the scan looks at
   every string literal long enough to be a class list. */
{
  const GROUND = /bg-\(--app-(page|surface|surface-2)\)/;
  const WHITE = /(?<![-:\w])text-white(?![-/\w])/;
  const DEAD_PLACEHOLDER = /(?<![-\w:])placeholder-(gray|slate)-\d+(?![-\w])/;

  const white: string[] = [];
  const dead: string[] = [];
  for (const f of FILES) {
    if (f.includes("/admin/")) continue;
    const body = read(f);
    for (const m of body.match(/"[^"\n]{20,400}"/g) ?? []) {
      if (GROUND.test(m) && WHITE.test(m)) white.push(f);
      if (DEAD_PLACEHOLDER.test(m)) dead.push(f);
    }
  }
  check(
    "no white ink on a themed ground, string constants included",
    white.length === 0,
    [...new Set(white)].join(", ")
  );
  check(
    "no `placeholder-<colour>` anywhere — Tailwind v4 removed it",
    dead.length === 0,
    [...new Set(dead)].join(", ") ||
      "it produces nothing, so those placeholders had no styling in dark mode at all"
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   9. Nothing user-facing rides the grey ramp any more
   ══════════════════════════════════════════════════════════════════════════
   The light theme works by redefining the gray/slate ramp variables, so a
   `text-gray-400` means one colour in one theme and a different one in the
   other. That is right for the admin panel, which is painted entirely in that
   ramp. It is wrong for anything whose job is to look the SAME in both — an
   identity colour, or ink on a page that is always white.

   It cost a real defect: the printed certificate wrote its serial number in
   `text-gray-400`, which resolves dark in light mode and #99a1af in dark, so
   a worker reading in dark mode printed a certificate with a serial you could
   barely see. Those are literal values now, and this keeps them that way. */
{
  // `border-t-gray-950` hid from the first version of this: it looked for
// `border-` immediately followed by the ramp name, and a directional
// border puts a side in between.
  const RAMP = /(?<![-\w:])(bg|text|border|ring|from|via|to|divide|shadow|stroke|fill|outline)(-(t|b|l|r|x|y|s|e))?-(gray|slate|indigo)-\d+/;
  const offenders: string[] = [];
  for (const f of FILES) {
    if (f.includes("/admin/")) continue;
    const body = read(f);
    for (const m of body.match(/"[^"\n]{4,400}"/g) ?? []) {
      if (RAMP.test(m)) offenders.push(f);
    }
  }
  check(
    "no user-facing class rides the theme's grey ramp",
    offenders.length === 0,
    [...new Set(offenders)].join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   10. A badge a sighted person can read
   ══════════════════════════════════════════════════════════════════════════
   `aria-label` is spoken by a screen reader and shown to nobody else. The
   verified tick in the feed carried one and nothing more, so hovering it —
   or tapping it — produced silence, which is what the owner reported. The
   profile badge has its own hover pill; the bare icons need the browser's.

   `title` is the cheap correct answer here: no positioning, no z-index, no
   stacking context to lose it behind, and long-press works on touch. */
{
  const files = [
    "src/components/user/feed/feed-post-card.tsx",
    "src/components/user/feed/feed-right-rail.tsx",
  ];
  const silent: string[] = [];
  for (const f of files) {
    const body = read(f);
    // Every verified mark in these files must be inside something that names
    // itself to a pointer, not only to a screen reader.
    for (const m of body.match(/aria-label="Verified"[\s\S]{0,120}/g) ?? []) {
      const near = body.slice(Math.max(0, body.indexOf(m) - 160), body.indexOf(m) + 160);
      if (!/title="Verified"/.test(near)) silent.push(f);
    }
  }
  check(
    "a verified tick says so to a pointer, not only to a screen reader",
    silent.length === 0,
    [...new Set(silent)].join(", ")
  );
  check(
    "the profile badge's tooltip pill and its arrow are the same colour",
    /border-t-\(--app-page\)\/95/.test(
      read("src/components/user/profile/verified-badge.tsx")
    ),
    "the arrow is the pill's own corner; a ramp step made it a near-match in dark and a mismatch in light"
  );
}

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
