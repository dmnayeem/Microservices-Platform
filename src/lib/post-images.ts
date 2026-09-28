/**
 * The images a post may carry: at most 10, each a web URL or one of our own
 * `/api/media/…` paths. Anything else (a `javascript:` URL, an object, a
 * megabyte string) is refused rather than stored and rendered to every viewer.
 */
export const MAX_POST_IMAGES = 10;

export function validPostImages(images: unknown): string[] | null {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images) || images.length > MAX_POST_IMAGES) return null;
  for (const u of images) {
    if (typeof u !== "string" || u.length > 2048) return null;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/api/media/")) return null;
  }
  return images as string[];
}
