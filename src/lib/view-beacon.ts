/**
 * Batched post-view reporting (client side).
 *
 * Each feed card used to POST `/api/feed/[id]/view` the moment it had been on
 * screen for two seconds. That endpoint cost ~15 queries and wrote a
 * notification row, so a single 20-post scroll generated ~300 queries — for
 * analytics nobody reads in real time.
 *
 * Ids are collected here instead and flushed together: on a short debounce, when
 * the buffer fills, when the tab is hidden, and on unload. `sendBeacon` is used
 * for the hidden/unload path because a normal `fetch` is cancelled when the page
 * goes away.
 */

const ENDPOINT = "/api/feed/views";
const FLUSH_AFTER_MS = 4_000;
/** Matches the server's `max(50)` on the ids array. */
const MAX_BATCH = 50;

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function post(ids: string[], useBeacon: boolean): void {
  if (ids.length === 0) return;
  const body = JSON.stringify({ ids });
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    // Survives the page going away, unlike fetch().
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function flush(useBeacon = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending.size === 0) return;
  const ids = [...pending].slice(0, MAX_BATCH);
  for (const id of ids) pending.delete(id);
  post(ids, useBeacon);
  // Anything over the cap goes in the next flush.
  if (pending.size > 0) schedule();
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => flush(false), FLUSH_AFTER_MS);
}

function bindListeners(): void {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  // Don't lose a partial batch when the user switches tabs or leaves.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

/** Queue one post id as viewed. Safe to call repeatedly — ids are de-duplicated. */
export function reportPostView(postId: string): void {
  if (!postId) return;
  bindListeners();
  pending.add(postId);
  if (pending.size >= MAX_BATCH) {
    flush(false);
    return;
  }
  schedule();
}
