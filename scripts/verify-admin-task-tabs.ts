import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/prisma";
import { TaskStatus } from "../src/generated/prisma";

/**
 * Admin task list — one tab per status the admin actually has to work through.
 *
 * Every task was listed together, and the only way to narrow it was four stat
 * cards that happened to be links. Two problems in one control: they read as a
 * dashboard rather than as a filter, and each one was a bare
 * `/admin/tasks?status=X`, so switching status threw away whatever type, board
 * or search was already applied.
 *
 * The gap that mattered most was what the cards did NOT offer. Archived tasks
 * had no entry point at all — and archiving is what happens instead of
 * deleting, because a task's submissions are the record of work users were
 * paid for. Expired had none either, and this database holds 13 of them.
 *
 * The check worth keeping is the last one: every status with real rows in it
 * has a way to be seen. A status added later, with tasks quietly accumulating
 * in it and no tab, is exactly the state this page was already in.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-admin-task-tabs.ts
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

const PAGE = "src/app/admin/tasks/page.tsx";
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** The tab values declared in the page, in order. */
function declaredTabs(src: string): string[] {
  const table = src.slice(src.indexOf("const STATUS_TABS"), src.indexOf("] as const;"));
  return [...table.matchAll(/value: "([^"]+)"/g)].map((m) => m[1]);
}

async function main() {
  console.log("\n=== Admin task tabs ===\n");
  const src = read(PAGE);
  const tabs = declaredTabs(src);

  /* ── 1. The tabs exist and cover what was asked for ── */
  console.log("1. The four states an admin sorts by, plus a way back");
  {
    check("there is a tab table", tabs.length > 0, tabs.join(", "));
    for (const want of ["ACTIVE", "PAUSED", "DRAFT", "ARCHIVED"]) {
      check(`${want} has a tab`, tabs.includes(want));
    }
    // Without "All" a filter is a trap: every tab narrows and none widens.
    check("All is first, so there is always a way back", tabs[0] === "all");
    check(
      "it is a real tablist, not just links",
      /role="tablist"/.test(src) && /aria-selected=\{current\}/.test(src)
    );
  }

  /* ── 2. Switching status keeps the rest of the filter ── */
  console.log("\n2. A tab narrows the list without undoing the other filters");
  {
    check("tab links are built, not hard-coded", /const tabHref = \(status: string\)/.test(src));
    for (const f of ["type", "difficulty", "board", "search"]) {
      check(`${f} survives a tab switch`, new RegExp(`params\\.${f}`).test(src.slice(src.indexOf("const tabHref"))));
    }
    // Page must NOT survive: page 4 of Active is not page 4 of Draft.
    const builder = src.slice(src.indexOf("const tabHref"), src.indexOf("};", src.indexOf("const tabHref")));
    check(
      "…but the page number resets",
      !/params\.page/.test(builder),
      "carrying the page over lands the admin on an empty page of a shorter list"
    );
    check(
      "All drops the status parameter instead of passing 'all'",
      /if \(status !== "all"\) q\.set\("status", status\)/.test(src)
    );
  }

  /* ── 3. The counts are each own their query ── */
  console.log("\n3. Each tab shows its own count");
  {
    check(
      "Archived is counted",
      /prisma\.task\.count\(\{ where: \{ status: "ARCHIVED" \} \}\)/.test(src)
    );
    check(
      "Expired is counted",
      /prisma\.task\.count\(\{ where: \{ status: "EXPIRED" \} \}\)/.test(src)
    );
    // `totalCount` is the count of the current filter, so reusing it for All
    // would make the All tab read as whatever tab is open.
    check(
      "All has an unfiltered count of its own",
      /prisma\.task\.count\(\),/.test(src),
      "totalCount is filtered — it would show the open tab's number"
    );
  }

  /* ── 4. Nothing is stranded ── */
  console.log("\n4. Every status with tasks in it can be reached");
  {
    const rows = (await prisma.task.groupBy({
      by: ["status"],
      _count: { _all: true },
    })) as unknown as { status: TaskStatus; _count: { _all: number } }[];

    const stranded: string[] = [];
    for (const r of rows) {
      if (r._count._all === 0) continue;
      if (!tabs.includes(r.status)) stranded.push(`${r.status} (${r._count._all})`);
    }
    // "All" technically reaches everything, so this is about a status having
    // its own way in rather than being buried among every other task.
    check(
      "no status holds tasks without a tab of its own",
      stranded.length === 0,
      stranded.join(", ")
    );

    for (const r of rows) {
      if (!tabs.includes(r.status)) continue;
      console.log(`       ${r.status}: ${r._count._all}`);
    }

    // A tab for a status that cannot exist would be dead furniture.
    const valid = new Set<string>(Object.values(TaskStatus));
    const bogus = tabs.filter((t) => t !== "all" && !valid.has(t));
    check("no tab names a status the schema does not have", bogus.length === 0, bogus.join(", "));
  }

  /* ── 5. The row reads on a phone ── */
  console.log("\n5. Seven tabs still fit a phone");
  {
    // A sideways-scrolling row hides its own contents, and that has been
    // reported here before as something users cannot tell is there. Wrapping
    // costs a second line and hides nothing.
    check(
      "the row wraps instead of scrolling sideways",
      /flex flex-wrap items-center gap-1\.5/.test(src) &&
        !/overflow-x-auto pb-1 -mx-1 px-1/.test(src),
      "a tab off the right edge is a tab nobody knows exists"
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main().finally(() => process.exit(process.exitCode ?? 0));
