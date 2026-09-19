import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { SOCIAL_PLATFORMS, getAction } from "../src/lib/social-tasks";
import { diyPromptFor } from "../src/lib/social-ai-recipe";

/**
 * Two prompts, two jobs — and both screens have to say which is which.
 *
 * A Pinterest pin needs two completely different things from an AI: the words
 * and the picture. They come from two different admin fields and arrive as two
 * separate blocks on the user's screen, and neither screen said so.
 *
 * On the admin side that meant image directions written into the content box,
 * where they shape the caption and never reach the image. On the user side it
 * is worse: both prompts are written FOR an AI, open with "You are an
 * expert…", and run to thousands of characters — so they read as the task
 * itself, and get pasted into Pinterest rather than into ChatGPT.
 *
 * What this file guards is the explaining, not the prompts. The text can be
 * rewritten freely; what must not come back is a screen that shows a
 * 5,000-character prompt with no statement of what it is for.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ai-prompt-clarity.ts
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
  console.log("\n=== AI prompt clarity ===\n");

  /* ── 1. The two prompts really are two things ── */
  console.log("1. A pin genuinely needs both");
  {
    const pinterest = SOCIAL_PLATFORMS.find((p) => p.key === "PINTEREST");
    const createPin = getAction("PINTEREST", "CREATE_PIN");
    check("Pinterest's Create Pin still exists", !!pinterest && !!createPin);

    // The content prompt's job: the fields an AI is allowed to write.
    check(
      "the action declares text fields for the AI to write",
      (createPin?.aiGeneratableFields ?? []).length > 0,
      (createPin?.aiGeneratableFields ?? []).join(", ")
    );
    // The image prompt's job: a field with its own role, which is what the
    // admin explainer keys off to decide whether to mention it at all.
    check(
      "…and a separate image-prompt field",
      (createPin?.adminFields ?? []).some((f) => f.role === "imagePrompt")
    );
    // An action with no picture must not be told about an image prompt.
    const follow = getAction("PINTEREST", "FOLLOW_PROFILE");
    check(
      "an action with no picture has no image-prompt field",
      !(follow?.adminFields ?? []).some((f) => f.role === "imagePrompt"),
      "explaining a field that does not exist is its own confusion"
    );

    // The content prompt is real text, not an empty shell — this is what the
    // user is asked to copy.
    const built = diyPromptFor(
      createPin!,
      "Pinterest",
      { destinationUrl: "https://shop.test/p/1" },
      { title: "Coffee table", description: "Walnut, mid-century" },
      "Friendly tone."
    );
    check("a content prompt is actually produced", built.trim().length > 100, `${built.length} chars`);
    check("…and carries the admin's extra guidance", built.includes("Friendly tone."));
  }

  /* ── 2. The admin is told which box does what ── */
  console.log("\n2. The admin form names both prompts");
  {
    const src = read("src/app/admin/tasks/_components/SocialTaskBuilder.tsx");
    check(
      "the box is labelled as the CONTENT prompt, with the platform named",
      /\{label\} content prompt/.test(src),
      '"Extra AI instructions" alone never said which of the two it shaped'
    );
    check(
      "both prompts are named in one place",
      /task content prompt/.test(src) && /task image prompt/.test(src)
    );
    check(
      "the image prompt is attributed to the field it really comes from",
      /not from this box/.test(src),
      "this is the mistake it exists to prevent"
    );
    check(
      "…and only shown for actions that have one",
      /hasImagePrompt/.test(src) && /f\.role === "imagePrompt"/.test(src)
    );
    check(
      "the admin can see whether the image prompt is set or empty",
      /imagePromptSet/.test(src),
      "an empty one silently leaves users with no image instructions at all"
    );
    check(
      "the text box no longer invites image directions",
      /Image directions do not belong here/.test(src)
    );
  }

  /* ── 3. The user is told what to DO with each ── */
  console.log("\n3. The user screen explains both, in steps");
  {
    const src = read("src/components/user/tasks/social-recipe-panel.tsx");
    check("there is a shared step-by-step explainer", /function PromptHowTo/.test(src));
    check(
      "it is numbered, because the order matters",
      /\{i \+ 1\}/.test(src),
      "a paragraph of prose is what people skipped"
    );
    check(
      "the text prompt says what it produces",
      /Text prompt — writes your \{platformLabel\} post/.test(src)
    );
    check(
      "the image prompt says it is NOT the text",
      /This one makes the picture, not the text/.test(src),
      "the two blocks look alike, so each has to distinguish itself"
    );
    // Each explainer must name all three moves — copy, paste into the AI, and
    // bring the result back. Stopping at "copy this" is where people stalled.
    for (const [tone, needle] of [
      ["text", "Paste it into ChatGPT or Gemini and send it."],
      ["image", "Paste it into ChatGPT or Gemini and ask for the image."],
    ] as const) {
      check(`the ${tone} steps say where to paste it`, src.includes(needle));
    }
    check(
      "the image steps end at the upload, not at the download",
      /upload it to \$\{platformLabel\} when you create your post/.test(src)
    );

    // Copy must still take the whole prompt even while collapsed — the
    // collapsing is for reading on a phone, never for what lands on the
    // clipboard.
    const copy = read("src/components/user/primitives/copy-field.tsx");
    check(
      "collapsing never truncates what gets copied",
      /<CopyButton value=\{value\} \/>/.test(copy)
    );
    check(
      "long prompts stay collapsed by default so a phone can scroll past them",
      /max-h-24 overflow-hidden/.test(copy)
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
