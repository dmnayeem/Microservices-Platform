/**
 * verify-level-sync — every path that awards XP must recompute the level.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-level-sync.ts
 *
 * This existed as a live defect, not a hypothetical. Twelve routes award XP;
 * five recomputed the level afterwards and seven did not, so a user who earned
 * from a daily mission, a quiz, a board claim or an event watched their
 * progress bar sit at 100% until they happened to submit an ordinary task —
 * the one path that did the recompute. One real account was found frozen that
 * way: 322 XP, stored level 2, curve says 3.
 *
 * verify-phase2b-behaviour already catches the CONSEQUENCE, by comparing every
 * stored level against the curve. It only catches it once a user has actually
 * been left behind, which means the first person to notice is a user. This
 * catches the CAUSE: a new route that increments xp without syncing fails here
 * on the commit that adds it.
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

/** Every .ts under src that could touch the user row. */
function sources(): string[] {
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
      else if (e.name.endsWith(".ts")) out.push(rel);
    }
  };
  walk("src/app/api");
  walk("src/lib");
  return out.sort();
}

console.log("\nverify-level-sync\n");

/* ══════════════════════════════════════════════════════════════════════════
   1. There is one place that does the recompute
   ══════════════════════════════════════════════════════════════════════════ */
{
  const sync = read("src/lib/level-sync.ts");
  check("the sync helper exists", /export async function syncUserLevel/.test(sync));
  check(
    "a non-throwing variant exists for callers that have already paid out",
    /export async function syncUserLevelQuietly/.test(sync)
  );
  /* A level that can fall is a promise that can be taken back. */
  check(
    "the level only ever rises",
    /if \(shouldBe <= user\.level\) return/.test(sync),
    "demoting someone who was already told they are level 9 is a support ticket, not a fix"
  );
  check(
    "it reads the curve rather than carrying its own copy",
    /calculateLevel/.test(sync) && !/=== 100|>= 250/.test(sync),
    "four competing curves is what caused this family of bugs originally"
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Every XP writer syncs
   ══════════════════════════════════════════════════════════════════════════
   The check is per FILE, not per line: several routes award in a transaction
   and sync after it, which is correct and is not adjacent in the source. */
{
  const AWARDS = /xp:\s*\{\s*increment/;
  const SYNCS = /syncUserLevel(Quietly)?\(|calculateLevel\(/;

  const awarding: string[] = [];
  const silent: string[] = [];
  for (const f of sources()) {
    if (f === "src/lib/level-sync.ts") continue;
    const body = read(f);
    if (!AWARDS.test(body)) continue;
    awarding.push(f);
    if (!SYNCS.test(body)) silent.push(f);
  }

  check(
    `every file that increments xp also recomputes the level (${awarding.length} files)`,
    silent.length === 0,
    silent.join(", ")
  );
  /* If this number drops to zero the scan has stopped finding anything and the
     check above passes for the wrong reason. */
  check(
    "the scan still finds the XP writers at all",
    awarding.length >= 10,
    `found ${awarding.length}`
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   3. The sync runs outside the transaction that paid the reward
   ══════════════════════════════════════════════════════════════════════════
   A level bump failing must never roll back a credited reward. Losing a level
   for a few minutes is recoverable; losing the payment is not. */
{
  const offenders: string[] = [];
  for (const f of sources()) {
    const body = read(f);
    for (const m of body.matchAll(/\$transaction\(\s*(?:async\s*\([^)]*\)\s*=>\s*)?\{/g)) {
      // Crude but sufficient: take the 2000 characters after the transaction
      // opens and object if a sync appears before the closing `});`.
      const chunk = body.slice(m.index ?? 0, (m.index ?? 0) + 2000);
      const end = chunk.indexOf("});");
      const inside = end === -1 ? chunk : chunk.slice(0, end);
      if (/syncUserLevel(Quietly)?\(/.test(inside)) offenders.push(f);
    }
  }
  check(
    "no sync sits inside the transaction that awarded the XP",
    offenders.length === 0,
    [...new Set(offenders)].join(", ")
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   4. The repair exists and is safe to run
   ══════════════════════════════════════════════════════════════════════════ */
{
  const backfill = read("scripts/backfill-levels.ts");
  check("a backfill exists for accounts already left behind", backfill.length > 0);
  check(
    "it is a dry run unless told otherwise",
    /const APPLY = process\.argv\.includes\("--apply"\)/.test(backfill),
    "a script that writes to real accounts on the first invocation is one you run by accident"
  );
  check(
    "it raises only, never demotes",
    /u\.shouldBe > u\.level/.test(backfill) && /left alone on purpose/.test(backfill)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5. The curve is one curve
   ══════════════════════════════════════════════════════════════════════════
   The original defect in this family was two curves disagreeing: the one that
   WROTE `User.level` and the one that DREW the progress bar. Making the curve
   admin-editable is the fastest way to rebuild that, if the server reads the
   admin's numbers and the browser keeps the shipped ones. */
{
  const level = read("src/lib/level.ts");
  const server = read("src/lib/level-curve-server.ts");
  const layout = read("src/app/layout.tsx");

  check(
    "there is one module-level curve, not a parameter on every call site",
    /let CURVE: number\[\]/.test(level),
    "a curve passed by some callers and defaulted by others is the original bug wearing a hat"
  );
  check(
    "a curve that does not climb is refused",
    /if \(!Number\.isFinite\(t\) \|\| t <= last\) return false/.test(level),
    "a flat step makes 'what level is this XP' ambiguous"
  );
  check(
    "…and refused again on the way out of the database",
    /if \(!Number\.isFinite\(t\) \|\| t <= last\) return fallback/.test(server),
    "the value lives in a JSON column a hand edit can reach without passing the route"
  );
  check(
    "the browser is handed the same numbers before it renders",
    /__EG_LEVEL_CURVE/.test(layout) && /__EG_LEVEL_CURVE/.test(level),
    "a fetch would draw the shipped curve on first paint and then correct itself"
  );
  check(
    "the level writer puts the admin's curve in force first",
    /ensureLevelCurve\(\)/.test(read("src/lib/level-sync.ts"))
  );
  check(
    "so does the backfill",
    /ensureLevelCurve\(\)/.test(read("scripts/backfill-levels.ts"))
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6. The admin screen
   ══════════════════════════════════════════════════════════════════════════ */
{
  const route = read("src/app/api/admin/gamification/level-curve/route.ts");
  const ach = read("src/app/api/admin/gamification/achievements/route.ts");
  const editor = read(
    "src/components/admin/gamification/gamification-editor.tsx"
  );
  const sources = read("src/lib/xp-sources.ts");

  check(
    "saving a curve needs the settings permission",
    /can\(session\.user\.id, "settings\.edit"\)/.test(route)
  );
  check(
    "saving a curve drops the settings cache",
    /invalidateSettingsCache\(\)/.test(route)
  );
  /* Found by testing it rather than by reading it: clearing the in-memory map
     is not enough, because the read also carries an Accelerate cacheStrategy
     and that edge cache keeps serving the old row for its TTL. The first live
     run saved a curve and watched the old one stay in force. */
  check(
    "…and primes the value it just wrote",
    /primeSetting\(LEVEL_CURVE_KEY/.test(route),
    "clearing alone leaves the edge cache serving the old row — the admin saves, reloads, sees nothing"
  );
  check(
    "the route rejects a curve that does not climb, naming the level",
    /must need more XP than the level below it/.test(route)
  );
  check(
    "the editor warns before the save is attempted",
    /is not higher than the level below it/.test(editor)
  );
  check(
    "the editor says plainly that nobody is demoted",
    // Whitespace-insensitive: JSX wraps prose across lines, so matching an
    // exact phrase here fails on formatting rather than on meaning.
    /never demotes anyone/.test(editor.replace(/\s+/g, " ")),
    "an admin raising a threshold will assume the opposite unless told"
  );
  check(
    "deleting an achievement somebody unlocked switches it off instead",
    /row\._count\.users > 0/.test(ach) && /deactivated: true/.test(ach),
    "an unlock is a record of something a user did; deleting the parent erases it"
  );
  check(
    "a duplicate name is explained in words, not as P2002",
    /already exists/.test(ach)
  );

  /* "What raises a level" was the owner's actual question and nothing could
     answer it. The table must not pretend to be editable when it is not —
     that is how this codebase ended up with 44 dead settings. */
  check(
    "every XP source is listed with where its figure is set",
    /configurable: string/.test(sources) &&
      (sources.match(/label:/g) ?? []).length >= 12
  );
  check(
    "the list says it is a reference, not a control",
    /reference, not a control/.test(editor) && /not a config/.test(sources)
  );
}

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
