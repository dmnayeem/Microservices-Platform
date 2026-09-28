/**
 * Task instructions, which are now rich text but used not to be.
 *
 * `Task.instructions` held one plain step per line, joined with `\n`, and every
 * surface rendered it as `.split("\n")` into a numbered list. The admin editor
 * is a rich-text editor now, so new tasks store HTML — but the column is full
 * of the old format and nothing migrates it.
 *
 * So both shapes have to keep working, forever, and the decision of which is
 * which lives here rather than being re-guessed at each of the five places that
 * render instructions. Old tasks keep their numbered steps; new ones get their
 * formatting; nobody has to run a migration over live data to make it so.
 *
 * Client-safe: no server imports, so the admin editor and the user-facing
 * renderers share one definition.
 */
import { sanitizeRichHtml } from "@/lib/rich-html";

/**
 * Does this value carry markup?
 *
 * Looks for a real tag from the set the editor can produce. A bare `<` in prose
 * ("use < 5 words") is not a tag and must not be treated as one, which is why
 * this matches an element name rather than just an angle bracket.
 */
export function isHtmlInstructions(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<\/?(?:p|h[1-6]|ul|ol|li|strong|em|b|i|u|s|a|img|blockquote|pre|code|hr|br|div|span)\b[^>]*>/i.test(
    value
  );
}

/** The old plain-text form, as an array of steps. */
export function legacySteps(value: string | null | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Old steps as HTML, so opening an existing task in the rich editor shows the
 * work that is already there instead of an empty box.
 *
 * A numbered list, because that is exactly how those steps have always been
 * displayed — the admin should recognise what they see.
 */
export function legacyStepsToHtml(value: string | null | undefined): string {
  const steps = legacySteps(value);
  if (steps.length === 0) return "";
  return `<ol>${steps.map((s) => `<li><p>${esc(s)}</p></li>`).join("")}</ol>`;
}

/** Whatever is stored, as HTML the editor can load. */
export function instructionsToEditorHtml(
  value: string | null | undefined
): string {
  if (!value) return "";
  return isHtmlInstructions(value) ? value : legacyStepsToHtml(value);
}

/**
 * Strip anything that could execute before this is rendered.
 *
 * Instructions are written by staff but read by every user, so the output is
 * treated as untrusted regardless: an admin account is exactly what an attacker
 * would be aiming for, and "our own staff wrote it" is not a security boundary.
 * Same denylist as the offer renderer, which this deliberately mirrors rather
 * than inventing a second, differently-wrong list.
 */
export function sanitizeInstructionsHtml(html: string): string {
  // Shared with the blog and popups (lib/rich-html.ts). It also keeps a
  // YouTube embed from the editor's video button, rebuilt from its src.
  return sanitizeRichHtml(html);
}

/** Is there anything at all to show? */
export function hasInstructions(value: string | null | undefined): boolean {
  if (!value) return false;
  return isHtmlInstructions(value)
    ? sanitizeInstructionsHtml(value).replace(/<[^>]+>/g, "").trim().length > 0 ||
        /<(?:img|hr)\b/i.test(value)
    : legacySteps(value).length > 0;
}

/**
 * Is this editor output effectively blank?
 *
 * Tiptap serialises an empty document as `<p></p>`, which is not an empty
 * string and would be stored, then rendered as an empty instructions box on
 * every task page. Anything with visible text, an image or a rule counts as
 * content; markup alone does not.
 */
export function isEmptyInstructionsHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  if (/<(?:img|hr)\b/i.test(html)) return false;
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").trim().length === 0;
}
