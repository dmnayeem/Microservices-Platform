/**
 * Word counting, shared by the profile form and the API that validates it.
 *
 * Deliberately dependency-free so the browser and the server can both import it
 * — a limit the form enforces one way and the server another is a limit that
 * either rejects text the user was allowed to type, or lets through text the
 * counter said was too long.
 */

/** How many words a profile bio may hold. */
export const BIO_WORD_LIMIT = 70;

/**
 * A hard character ceiling on top of the word limit.
 *
 * Seventy words is roughly 400–500 characters of ordinary prose, but "words"
 * are whitespace-separated: without this, one 20,000-character run of letters
 * counts as a single word and sails through. The column is `String?` and the
 * bio renders on a public profile, so the byte length has to be bounded by
 * something regardless of how the words fall.
 */
export const BIO_CHAR_LIMIT = 1000;

/**
 * Count words the way a person would: runs of non-whitespace.
 *
 * Not a split on " " — that counts empty strings between consecutive spaces and
 * reports a bio of "hello    world" as five words. Newlines and tabs separate
 * words too, so a bio written as a list is counted correctly.
 */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Cut text down to at most `limit` words, preserving what the user typed
 * between them.
 *
 * Used by the form to stop a paste from blowing past the limit. It keeps the
 * original spacing of the part it keeps rather than rebuilding the string from
 * the split, so line breaks inside the kept text survive.
 */
export function truncateWords(text: string, limit: number): string {
  if (limit <= 0) return "";
  const re = /\S+/g;
  let count = 0;
  let end = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    count += 1;
    end = m.index + m[0].length;
    if (count === limit) break;
  }
  if (count < limit) return text;
  return text.slice(0, end);
}
