/**
 * Client-side request coalescing for ad slots.
 *
 * Every `<AdRenderer>` used to send its own `/api/spaces/panel?placement=X` on
 * mount. A page with an anchor, a top banner and a handful of under-post slots
 * fired them all at once, each repeating the viewer / placement / pool reads on
 * the server. Initial loads now queue here for ~10ms and go out as ONE
 * `?placements=A,B,C` request; the server serves them with cross-slot exclusion
 * so two copies of the same space get different creatives.
 *
 * Only FIRST loads are batched. Rotations and "own inventory" fallbacks are
 * single, flagged requests (`rot=1` / `own=1`) and stay on the original path.
 *
 * Client-only.
 */

const WINDOW_MS = 10;
const MAX_BATCH = 12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface Pending {
  placement: string;
  exclude: string[];
  resolve: (data: Json) => void;
}

const queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = queue.splice(0, MAX_BATCH);
  if (queue.length > 0) timer = setTimeout(flush, WINDOW_MS);
  if (batch.length === 0) return;

  if (batch.length === 1) {
    const p = batch[0];
    const qs = p.exclude.length ? `&exclude=${encodeURIComponent(p.exclude.join(","))}` : "";
    try {
      const res = await fetch(`/api/spaces/panel?placement=${encodeURIComponent(p.placement)}${qs}`);
      p.resolve(res.ok ? await res.json() : null);
    } catch {
      p.resolve(null);
    }
    return;
  }

  const exclude = [...new Set(batch.flatMap((p) => p.exclude))].slice(0, 100);
  const qs = exclude.length ? `&exclude=${encodeURIComponent(exclude.join(","))}` : "";
  try {
    const res = await fetch(
      `/api/spaces/panel?placements=${encodeURIComponent(batch.map((p) => p.placement).join(","))}${qs}`
    );
    const data = res.ok ? await res.json() : null;
    const results: Json[] = Array.isArray(data?.results) ? data.results : [];
    batch.forEach((p, i) => p.resolve(results[i] ?? null));
  } catch {
    batch.forEach((p) => p.resolve(null));
  }
}

/** Queue a first-load ad request; resolves with the single-serve payload shape (or null). */
export function requestAdBatched(placement: string, exclude: string[]): Promise<Json> {
  return new Promise((resolve) => {
    queue.push({ placement, exclude, resolve });
    if (!timer) timer = setTimeout(flush, WINDOW_MS);
  });
}
