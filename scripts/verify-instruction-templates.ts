import fs from "fs";
import path from "path";
import {
  parseTemplateInput,
  isMissingTableError,
  STARTER_TEMPLATES,
} from "../src/lib/instruction-templates";
import { ADMIN_MODULES } from "../src/lib/rbac";

/**
 * Instruction templates (admin task creation). Static + pure checks, no DB.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-instruction-templates.ts
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

console.log("\n=== Instruction templates ===\n");

const list = code("src/app/api/admin/task-templates/route.ts");
const one = code("src/app/api/admin/task-templates/[id]/route.ts");
const lib = code("src/lib/instruction-templates.ts");
const picker = code("src/components/admin/tasks/instruction-template-picker.tsx");
const manager = code("src/components/admin/tasks/instruction-templates-manager.tsx");
const form = code("src/app/admin/tasks/_components/TaskForm.tsx");
const taskCreate = code("src/app/api/admin/tasks/route.ts");
const page = code("src/app/admin/tasks/templates/page.tsx");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261004100000_instruction_templates/migration.sql");

console.log("1. Content is sanitised on every write");
check(
  "parseTemplateInput runs sanitizeRichHtml over contentHtml",
  /sanitizeRichHtml\(raw\)/.test(lib)
);
const evil = parseTemplateInput({
  name: "x",
  category: "y",
  contentHtml: '<p onclick="alert(1)">hi</p><script>alert(2)</script><a href="javascript:alert(3)">l</a>',
});
check(
  "script, event handlers and javascript: URLs are stripped",
  evil.ok &&
    !/script|onclick|javascript:/i.test(evil.data.contentHtml ?? ""),
  JSON.stringify(evil)
);
check("an empty editor (<p></p>) is refused", !parseTemplateInput({ name: "a", category: "b", contentHtml: "<p></p>" }).ok);
check("an unknown task type is refused", !parseTemplateInput({ name: "a", category: "b", taskType: "NOPE", contentHtml: "<p>x</p>" }).ok);
check(
  "POST create, PATCH and the starter set all go through parseTemplateInput",
  (list.match(/parseTemplateInput\(/g) ?? []).length >= 2 && /parseTemplateInput\(/.test(one)
);
check(
  "no write path stores contentHtml straight from the body",
  !/contentHtml:\s*body\./.test(list + one)
);
check(
  "every starter template parses (non-empty, valid type)",
  STARTER_TEMPLATES.every((t) => parseTemplateInput(t).ok) && STARTER_TEMPLATES.length >= 4
);

console.log("\n2. Permissions");
check("GET checks permissions (tasks.view or a task create/edit permission)", /export async function GET[\s\S]*?canAny\(session\.user\.id, READ_PERMS\)/.test(list) && /"tasks\.view"/.test(list));
check("POST checks a create/edit permission", /export async function POST[\s\S]*?canAny\(session\.user\.id, CREATE_PERMS\)/.test(list));
check("PATCH checks tasks.create/tasks.edit", /export async function PATCH[\s\S]*?canAny\(session\.user\.id, MANAGE_PERMS\)/.test(one));
check("DELETE checks tasks.create/tasks.edit", /export async function DELETE[\s\S]*?canAny\(session\.user\.id, MANAGE_PERMS\)/.test(one));
check("MANAGE_PERMS is exactly tasks.create + tasks.edit", /MANAGE_PERMS: Permission\[\] = \["tasks\.create", "tasks\.edit"\]/.test(one));
check("the admin page requires tasks.view", /!perms\.has\("tasks\.view"\)\) redirect/.test(page));
check("every write is audited", (list.match(/writeAudit\(/g) ?? []).length >= 2 && (one.match(/writeAudit\(/g) ?? []).length >= 2);
const mod = ADMIN_MODULES.find((m) => m.href === "/admin/tasks/templates");
check("one sidebar entry, under Tasks, on tasks.view", !!mod && mod.category === "TASKS" && mod.permissions.join() === "tasks.view" && ADMIN_MODULES.filter((m) => m.href === "/admin/tasks/templates").length === 1);
check("its icon exists in the sidebar iconMap", !!mod && new RegExp(`\\n\\s*${mod.icon},`).test(read("src/components/admin/sidebar.tsx").split("export const iconMap")[1] ?? ""));

console.log("\n3. Fails soft before the migration is applied");
check("isMissingTableError recognises P2021", isMissingTableError({ code: "P2021" }));
check("…and the raw driver message", isMissingTableError({ message: 'relation "InstructionTemplate" does not exist' }));
check("…and nothing else", !isMissingTableError({ code: "P2002" }) && !isMissingTableError(null));
check("GET answers ready:false (200) on a missing table", /isMissingTableError\(e\)[\s\S]{0,80}ready: false/.test(list));
check("writes answer 503 'not set up yet' on a missing table", /TEMPLATES_NOT_READY \}, \{ status: 503 \}/.test(list) && /TEMPLATES_NOT_READY \}, \{ status: 503 \}/.test(one));
check("the picker shows the not-ready notice", /!data\.ready/.test(picker) && /TEMPLATES_NOT_READY/.test(picker));
check("the manager page shows the not-ready notice", /!data\.ready/.test(manager) && /TEMPLATES_NOT_READY/.test(manager));
check("the admin page itself makes no DB call (client loads, fails soft)", !/prisma/.test(page));
check(
  "the usage bump in task create can never fail the create",
  /instructionTemplate[\s\S]{0,40}\.updateMany\([\s\S]*?\)\s*\.catch\(/.test(taskCreate)
);
check("migration is additive + re-runnable", /CREATE TABLE IF NOT EXISTS "InstructionTemplate"/.test(migration) && !/DROP|ALTER TABLE "(?!InstructionTemplate)/i.test(migration));
check("schema has the model with a unique name and a category index", /model InstructionTemplate \{[\s\S]*?name\s+String\s+@unique[\s\S]*?@@index\(\[category\]\)/.test(schema));

console.log("\n4. Query budget");
check("list = exactly 2 queries in one Promise.all (findMany + groupBy)", /Promise\.all\(\[\s*prisma\.instructionTemplate\.findMany[\s\S]*?prisma\.instructionTemplate\.groupBy/.test(list) && !/\.count\(/.test(list));
check("pagination is take N+1, not a count query", /take: TEMPLATE_PAGE_SIZE \+ 1/.test(list));
check("no per-row queries (no prisma call inside map/for)", !/\.map\([^)]*=>[^;]*prisma\./.test(list + one) && !/for \([^)]*\)[^{]*\{[^}]*prisma\./.test(list + one));
check("starter set is one createMany", /createMany\(\{ data, skipDuplicates: true \}\)/.test(list));
check("PATCH/DELETE write without a read first", !/findUnique|findFirst/.test(one));
check("usage is counted inside the task-create request, not a separate call", /templateId: usedTemplateId/.test(form) && /body\.templateId/.test(taskCreate));
check("…and only on create", /!effectiveTaskId && usedTemplateId/.test(form));
check("picker search is debounced and aborts the previous request", /useDebounced\(q\.trim\(\), 300\)/.test(picker) && /abortRef\.current\?\.abort\(\)/.test(picker));

console.log("\n5. Task form wiring");
check("TaskForm has 'Use a template' and 'Save as template'", /Use a template/.test(form) && /Save as template/.test(form));
check("inserting remounts the editor (it only reads value on mount)", /key=\{instructionsEditorKey\}/.test(form) && /setInstructionsEditorKey\(/.test(form));
check("existing content → Replace or Append", /mode === "append"/.test(form) && /hasContent \?/.test(picker));
check("manager reuses the task form's RichTextEditor", /@\/components\/admin\/offers\/rich-text-editor/.test(manager));
check("delete asks first", /confirmDialog\(/.test(manager));
check("starters only on an explicit click", /starters: true/.test(manager) && !/starters: true/.test(form));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
