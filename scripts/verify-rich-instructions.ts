import "dotenv/config";
import fs from "fs";
import path from "path";
import { looksLikeMarkdown, markdownToHtml } from "../src/lib/markdown-paste";
import {
  isHtmlInstructions,
  legacySteps,
  legacyStepsToHtml,
  instructionsToEditorHtml,
  sanitizeInstructionsHtml,
  isEmptyInstructionsHtml,
  hasInstructions,
} from "../src/lib/task-instructions";

/**
 * Rich task instructions.
 *
 * The field was a row of plain <input> steps: no bold, no colour, no image, no
 * link, no alignment, and a paste from ChatGPT arrived as literal `##` and `**`
 * with every heading flattened. It is a Tiptap editor now.
 *
 * The load-bearing risk is not the editor — it is that `Task.instructions` is
 * full of the OLD plain-text format and nothing migrates it. Both shapes have
 * to render, forever, everywhere. Most of this file is about that.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-rich-instructions.ts
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

console.log("\n=== Rich task instructions ===\n");

/* ─────────────────────────────────────────────
   1. The ChatGPT paste
   ───────────────────────────────────────────── */
console.log("1. Pasting from ChatGPT");

const chatgpt = [
  "## How to complete this task",
  "",
  "Follow these steps **carefully**:",
  "",
  "1. Open [revtype.com](https://revtype.com)",
  "2. Copy the *exact* caption",
  "",
  "> Use #revtype as the first hashtag",
  "",
  "- Screenshot the post",
  "- Submit the URL",
].join("\n");

const html = markdownToHtml(chatgpt);
check("ChatGPT output is recognised as Markdown", looksLikeMarkdown(chatgpt));
check(
  "a heading becomes a heading, not literal ##",
  html.includes("<h2>How to complete this task</h2>") && !html.includes("## How"),
  "the hashes showing in the editor is the exact complaint"
);
check(
  "**bold** becomes <strong>, not literal asterisks",
  html.includes("<strong>carefully</strong>") && !html.includes("**carefully**")
);
check("a numbered list becomes <ol>", /<ol>[\s\S]*Open/.test(html));
check("a bullet list becomes <ul>", /<ul>[\s\S]*Screenshot/.test(html));
check(
  "a link becomes a real link",
  html.includes('<a href="https://revtype.com">revtype.com</a>')
);
check("*italic* becomes <em>", html.includes("<em>exact</em>"));
check("a quote becomes <blockquote>", html.includes("<blockquote>"));
check(
  "a hashtag inside the text stays text",
  html.includes("#revtype"),
  "only the leading-# HEADING syntax converts; a hashtag is content"
);

// Converting text nobody meant as Markdown is the expensive mistake — it
// rewrites what somebody typed. Not converting merely leaves them where they
// were before this existed.
console.log("\n2. Ordinary text is left alone");
check(
  "plain prose is not treated as Markdown",
  !looksLikeMarkdown("Please post this today. It is important - be careful.")
);
check(
  "a dash used as punctuation is not a bullet",
  !looksLikeMarkdown("Call me - I will explain")
);
check(
  "snake_case survives",
  markdownToHtml("use the file_name_here value").includes("file_name_here"),
  "underscores mid-word are not emphasis"
);
check(
  "arithmetic survives",
  markdownToHtml("2 * 3 * 4 = 24").includes("2 * 3 * 4"),
  "emphasis markers never have a space just inside them"
);
check(
  "pasted HTML is escaped, not executed",
  markdownToHtml("<script>alert(1)</script>").includes("&lt;script&gt;")
);

/* ─────────────────────────────────────────────
   3. Old tasks keep working
   ───────────────────────────────────────────── */
console.log("\n3. The old plain-text format still renders");

const legacy = "Open the app\nTap follow\nSend a screenshot";
check("plain text is not mistaken for HTML", !isHtmlInstructions(legacy));
check("its steps are still read line by line", legacySteps(legacy).length === 3);
check(
  "a bare < in prose is not treated as a tag",
  !isHtmlInstructions("keep it < 5 words"),
  "matching on an angle bracket alone would flip old tasks into the HTML path"
);
check("real markup is recognised", isHtmlInstructions("<p>hi</p>"));
check(
  "old steps open in the editor as the numbered list they were",
  instructionsToEditorHtml(legacy) === legacyStepsToHtml(legacy) &&
    legacyStepsToHtml(legacy).startsWith("<ol>"),
  "an admin opening an existing task must see their work, not an empty box"
);
check(
  "…with the text escaped on the way in",
  legacyStepsToHtml("5 < 10 & rising").includes("&lt;"),
  "old plain text may contain characters that are markup in the new world"
);
check("HTML is passed through untouched", instructionsToEditorHtml("<p>x</p>") === "<p>x</p>");
check("both shapes report as having content", hasInstructions(legacy) && hasInstructions("<p>hi</p>"));
check(
  "an empty editor document is treated as empty",
  isEmptyInstructionsHtml("<p></p>") && !hasInstructions("<p></p>"),
  "Tiptap serialises empty as <p></p>; storing that renders a blank box on every task page"
);
check(
  "…but an image-only instruction is NOT empty",
  !isEmptyInstructionsHtml('<p><img src="/a.png"></p>'),
  "a screenshot with no words is still an instruction"
);

/* ─────────────────────────────────────────────
   4. It is sanitised before anyone sees it
   ───────────────────────────────────────────── */
console.log("\n4. Sanitising");
check(
  "scripts are stripped",
  !sanitizeInstructionsHtml('<p>a</p><script>alert(1)</script>').includes("<script")
);
check(
  "inline handlers are stripped, quoted or not",
  !/onerror/i.test(sanitizeInstructionsHtml('<img src=x onerror=alert(1)>')) &&
    !/onclick/i.test(sanitizeInstructionsHtml('<p onclick="x()">a</p>'))
);
check(
  "javascript: URLs are defused",
  !/javascript:/i.test(sanitizeInstructionsHtml('<a href="javascript:alert(1)">x</a>'))
);
check(
  "iframes and forms are stripped",
  !/<iframe|<form/i.test(
    sanitizeInstructionsHtml('<iframe src="x"></iframe><form><input></form>')
  ),
  "instructions are staff-written but user-read; an admin account is what an attacker aims for"
);
check("ordinary formatting survives", sanitizeInstructionsHtml("<p><strong>hi</strong></p>").includes("<strong>"));

/* ─────────────────────────────────────────────
   5. Wiring
   ───────────────────────────────────────────── */
console.log("\n5. Wiring");

const form = code("src/app/admin/tasks/_components/TaskForm.tsx");
check(
  "the step inputs are gone",
  !/placeholder=\{`Step \$\{index \+ 1\} instructions/.test(form),
  "that row of plain inputs was the whole problem"
);
check("the editor is mounted instead", /<RichTextEditor/.test(form));
check(
  "…loaded lazily",
  /dynamic\(\s*\(\) => import\("@\/components\/admin\/offers\/rich-text-editor"\)/.test(form),
  "Tiptap plus ProseMirror is a large bundle and most visits never touch this field"
);
check(
  "existing tasks are loaded through the compatibility helper",
  /instructionsToEditorHtml\(task\?\.instructions\)/.test(form)
);
check(
  "an empty editor stores nothing",
  /isEmptyInstructionsHtml\(instructionsHtml\)/.test(form)
);
check(
  "the image button opens the media library, not a URL prompt",
  /onPickImage=\{pickInstructionImage\}/.test(form) &&
    /instructionImageResolve/.test(form),
  "a screenshot the admin just took is not at a URL yet"
);

const editor = code("src/components/admin/offers/rich-text-editor.tsx");
check("the editor converts a Markdown paste", /handlePaste/.test(editor) && /markdownToHtml/.test(editor));
check(
  "…only for plain text — a rich paste is left to Tiptap",
  /getData\("text\/html"\)[\s\S]{0,120}return false/.test(editor),
  "dragging from a web page already worked and must keep working"
);
check(
  "…and only when it really looks like Markdown",
  /looksLikeMarkdown\(text\)/.test(editor)
);

// Five surfaces used to carry the same `.split("\n").map(<li>)`.
const SURFACES = [
  "src/components/user/tasks/social-task-run-view.tsx",
  "src/components/user/tasks/article-task-detail-view.tsx",
  "src/components/user/tasks/manual-tasks-view.tsx",
  "src/components/user/tasks/proxy-tasks-view.tsx",
  "src/app/admin/tasks/[id]/page.tsx",
];
for (const f of SURFACES) {
  const src = code(f);
  check(
    `${f.split("/").pop()} uses the shared renderer`,
    /<TaskInstructions/.test(src),
    "five copies of the same split() would drift the moment rich text reached some and not others"
  );
  check(
    `…and no longer splits instructions by hand`,
    !/instructions[\s\S]{0,40}\.split\("\\n"\)/.test(src)
  );
}

const renderer = code("src/components/user/tasks/task-instructions.tsx");
check(
  "the renderer sanitises before injecting",
  /sanitizeInstructionsHtml\(value as string\)/.test(renderer) &&
    /dangerouslySetInnerHTML/.test(renderer)
);
check(
  // Still a numbered list, but the numbers are drawn rather than left to the
  // browser: `list-decimal` at 14px reads as a paragraph with digits in it,
  // which is what made task pages hard to scan. The rule being protected is
  // that legacy steps are not DROPPED and are still numbered in order.
  "…and still renders legacy steps as a numbered list",
  /legacySteps\(value\)/.test(renderer) &&
    /<ol/.test(renderer) &&
    /\{i \+ 1\}/.test(renderer)
);
check(
  "long instructions collapse instead of burying the task",
  /COLLAPSE_AFTER_STEPS/.test(renderer) && /Show all \$\{steps\.length\}|Show all \$/.test(renderer),
  "an admin pasting twenty steps must not push the action button off-screen"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
