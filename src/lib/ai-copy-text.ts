import "server-only";
import { generateJson } from "@/lib/gemini";
import { parseHashtags } from "@/lib/social-caption";
import type { CopyKind } from "@/lib/ai-copy-kind";

export { COPY_KIND_LABEL, copyKindFor, type CopyKind } from "@/lib/ai-copy-kind";

/**
 * One fresh piece of text for a member to post — a caption, comment, reply,
 * review, question or answer — from the admin's topic and summary (owner,
 * 2026-10-13). Powers the "Generate" button under every text box a member
 * copies from (POST /api/tasks/[id]/ai-text).
 *
 * Rules the result always keeps, whatever the model returns:
 *  - **Links are the admin's, untouched.** Every URL in the admin's reference
 *    text is swapped for a [LINKn] placeholder before the model sees it and
 *    put back afterwards; a placeholder the model dropped is re-added on its own
 *    line. Only the words around the link change.
 *  - **A caption carries hashtags** — the admin's own (never dropped, an
 *    auto-verify rule may require them), plus the model's when there are none.
 *    Other kinds carry none unless the admin's reference had them.
 *  - **Required words / hashtags** from the task's auto-verify rules are asked
 *    for and, for hashtags, appended if missing — a generated text must not
 *    fail the very check the task runs.
 */

/** Openings / framings rotated per call — the first line of defence against twins. */
const ANGLES = [
  "start with a short personal experience",
  "start with a question",
  "start with the main benefit",
  "start with a surprising fact from the summary",
  "write it casually, like a message to a friend",
  "write it confidently and to the point",
  "start with how it felt the first time",
  "focus on one specific detail",
  "start with a recommendation",
  "start with a short exclamation",
];

/** Two texts this alike (0..1, word overlap) count as the same text. */
const SIMILAR_AT = 0.7;

function words(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/#[\p{L}\p{N}_]+/gu, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}

/** Jaccard overlap of the words, links and hashtags ignored (they are shared on purpose). */
export function similarity(a: string, b: string): number {
  // The same opening reads as the same text, whatever follows.
  const open = (t: string) => [...words(t)].slice(0, 5).join(" ");
  if (open(a) && open(a) === open(b)) return 1;
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return a.trim() === b.trim() ? 1 : 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

const KIND_GUIDE: Record<CopyKind, string> = {
  caption: "a social media caption: 1 to 3 natural sentences, then a final line of 3 to 6 relevant hashtags",
  comment: "a short, genuine comment (1 to 2 sentences) a real person would leave — no hashtags",
  reply: "a short, friendly reply (1 to 2 sentences) — no hashtags",
  review: "an honest-sounding review of 2 to 4 sentences mentioning one or two specific things — no hashtags",
  question: "one clear, natural question a curious person would ask — no hashtags",
  answer: "a helpful answer of 2 to 4 sentences — no hashtags",
  post: "a social media post of 2 to 4 natural sentences",
};

export async function generateCopyText(opts: {
  kind: CopyKind;
  platformLabel: string;
  topic: string;
  summary: string;
  /** The admin's own text for this box — its links are kept, its tone guides. */
  reference?: string | null;
  /** The admin's caption hashtags (kept on a caption). */
  hashtags?: string | null;
  /** From the auto-verify rules: words / hashtags the text must contain. */
  requiredWords?: string[];
  requiredHashtags?: string[];
  /** Exact strings that must end up in the text (e.g. the member's personal verification code). */
  mustInclude?: string[];
  /** What other members already got for this same box — the result must not match any. */
  others?: string[];
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const reference = (opts.reference ?? "").trim();
  const links: string[] = [];
  const refMasked = reference.replace(URL_RE, (m) => {
    links.push(m);
    return `[LINK${links.length}]`;
  });

  const lines = [
    `Write ${KIND_GUIDE[opts.kind]} for ${opts.platformLabel}.`,
    opts.topic ? `Topic: ${opts.topic}` : "",
    opts.summary ? `What to say about it: ${opts.summary}` : "",
    refMasked
      ? `The advertiser's example (same idea and tone, but write it in fresh words so it is unique): "${refMasked}"`
      : "",
    links.length
      ? `Keep these placeholders exactly as written, once each, where they fit: ${links.map((_, i) => `[LINK${i + 1}]`).join(", ")}. Never write any other link or URL.`
      : "Do not include any link or URL.",
    opts.requiredWords?.length ? `It must contain these words: ${opts.requiredWords.join(", ")}.` : "",
    // A different angle each call, so two members are never handed one text.
    `Angle for this version: ${ANGLES[Math.floor(Math.random() * ANGLES.length)]}.`,
    "Write in the same language as the topic and example. No quotation marks around the text, no emojis overload (at most 2), no made-up facts, prices or promises.",
    'Return ONLY JSON: {"text": "..."}',
  ].filter(Boolean);

  // Unique per member: anything too close to what another member already got
  // is thrown away and written again, told what to avoid.
  const others = (opts.others ?? []).filter(Boolean);
  let text = "";
  let avoid: string[] = [];
  for (let attempt = 0; attempt < 5 && !text; attempt++) {
    const prompt = avoid.length
      ? `${lines.join("\n")}\nIt must read clearly different from these texts other people already posted — different opening, wording and structure:\n${avoid.map((a) => `- ${a.slice(0, 300)}`).join("\n")}`
      : lines.join("\n");
    const r = await generateJson(prompt, { temperature: Math.min(1.3, 0.9 + attempt * 0.15) });
    // Out of Gemini quota: every retry would fail the same way.
    if (!r.success && /quota|rate.?limit|exhausted|429/i.test(r.error ?? "")) {
      return { ok: false, error: "AI writing is busy right now. Please try again later." };
    }
    const t = r.success && typeof r.data?.text === "string" ? r.data.text.trim() : "";
    if (!t || t.length > 2000) continue;
    const close = others.filter((o) => similarity(o, t) >= SIMILAR_AT);
    if (close.length === 0) text = t;
    else avoid = [...close, ...avoid].slice(0, 6);
  }
  if (!text) return { ok: false, error: "AI couldn't write a unique text right now. Try again." };

  // Links: back from placeholders; any the model lost go on their own line.
  // Any URL the model invented is removed — only the admin's links may appear.
  text = text.replace(URL_RE, "").replace(/[ \t]{2,}/g, " ");
  links.forEach((url, i) => {
    const ph = `[LINK${i + 1}]`;
    text = text.includes(ph) ? text.split(ph).join(url) : `${text}\n${url}`;
  });
  // Leftover placeholder pieces ("[LINK2]", "}}", "{{") never reach a member.
  text = text
    .replace(/\[LINK\d*\]/gi, "")
    .replace(/\{\{[^}]*\}\}|[{}]{2,}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Auto-approval depends on these words being there: any the model dropped
  // is added at the end, word for word (owner, 2026-10-13).
  const lower = text.toLowerCase();
  const missing = [...(opts.requiredWords ?? []), ...(opts.mustInclude ?? [])]
    .map((w) => w.trim())
    .filter((w) => w && !lower.includes(w.toLowerCase()));
  if (missing.length) text = `${text}\n${missing.join(" · ")}`;

  // Hashtags.
  const have = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()));
  const mustTags = [
    ...(opts.kind === "caption" ? parseHashtags(opts.hashtags) : []),
    ...parseHashtags((opts.requiredHashtags ?? []).join(" ")),
  ].filter((h) => !have.has(h.toLowerCase()));
  if (mustTags.length) text = `${text}${/#[\p{L}\p{N}_]+\s*$/u.test(text) ? " " : "\n\n"}${mustTags.join(" ")}`;
  // A caption is never without hashtags: the model skipped them and the admin
  // set none — one from the topic.
  if (opts.kind === "caption" && !/#[\p{L}\p{N}_]+/u.test(text)) {
    const tag = (opts.topic || opts.summary).replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).slice(0, 3).join("");
    if (tag) text = `${text}\n\n#${tag}`;
  }
  // A caption's closing run of hashtags goes on its own line.
  if (opts.kind === "caption") {
    const m = text.match(/^([\s\S]*?\S)\s+((?:#[\p{L}\p{N}_]+\s*)+)$/u);
    if (m && !/#[\p{L}\p{N}_]+$/u.test(m[1])) text = `${m[1]}\n\n${m[2].trim()}`;
  }

  return { ok: true, text };
}
