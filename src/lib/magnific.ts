/**
 * Magnific (formerly Freepik) API integration.
 *
 * One key unlocks two very different product families, and they behave
 * differently enough that callers need to know which one they are touching:
 *
 *  1. **Stock library** - `/v1/resources`, `/v1/icons`, `/v1/videos`. Plain
 *     synchronous search. A separate `/download` call mints the real file URL.
 *  2. **AI generation** - `/v1/ai/...`. Asynchronous: the POST returns a
 *     `task_id` and you poll (or take a webhook) until `COMPLETED`.
 *
 * Two hazards that are easy to get wrong and expensive to get wrong late:
 *
 *  - **Every URL the API hands back is signed and expires** (`?token=exp=...`,
 *    hours, not days). Storing one in the database gives you a row that renders
 *    fine in testing and is a broken image next week. Always run results
 *    through `persistToS3()` before they touch Prisma.
 *  - **The AI endpoints spend real credits, and their validation is lenient.**
 *    Several models accept a body with no prompt at all and still bill for
 *    whatever they invent. Validate before calling, not after.
 *
 * The key resolves per call - env var first, then the admin
 * **Settings -> Integrations** row - so a key pasted in the admin screen takes
 * effect without a redeploy. This mirrors `lib/gemini.ts`.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { getSecret } from "@/lib/system-settings";
import { generateFileKey, uploadFile, isS3Configured } from "@/lib/s3";

const BASE = "https://api.magnific.com/v1";

export const magnificKey = () => getSecret("MAGNIFIC_API_KEY", "magnific_api_key");
export const magnificWebhookSecret = () =>
  getSecret("MAGNIFIC_WEBHOOK_SECRET", "magnific_webhook_secret");

export async function isMagnificConfigured(): Promise<boolean> {
  return !!(await magnificKey());
}

export type MagnificError = { success: false; error: string; status?: number };
export type MagnificOk<T> = { success: true; data: T };
export type MagnificResult<T> = MagnificOk<T> | MagnificError;

/**
 * The API reports failures in two shapes depending on the endpoint's vintage:
 * the modern `/v1/ai/*` routes return `{message, invalid_params:[{field,reason}]}`
 * while the older beta routes return `{status, code, message}`. Flatten both so
 * callers never have to care which one they hit.
 */
function describeError(status: number, body: unknown): string {
  const b = body as Record<string, unknown> | null;
  const msg = typeof b?.message === "string" ? b.message : `HTTP ${status}`;
  const params = b?.invalid_params;
  if (Array.isArray(params) && params.length) {
    const detail = params
      .map((p) => {
        const q = p as { field?: string; name?: string; reason?: string };
        return `${q.field ?? q.name ?? "?"}: ${q.reason ?? "invalid"}`;
      })
      .join("; ");
    return `${msg} (${detail})`;
  }
  return msg;
}

async function call<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> }
): Promise<MagnificResult<T>> {
  const key = await magnificKey();
  if (!key) return { success: false, error: "MAGNIFIC_API_KEY is not set" };

  let url = `${BASE}${path}`;
  if (init?.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "x-magnific-api-key": key,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // Results are per-request and signed; a cached response would hand back
      // an already-expired URL.
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { success: false, status: res.status, error: describeError(res.status, body) };
    }
    // Stock endpoints wrap the payload in `data`, a few do not. Unwrap once.
    const b = body as { data?: unknown } | null;
    return { success: true, data: (b && "data" in b ? b.data : body) as T };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------ *
 * Stock library
 * ------------------------------------------------------------------ */

export type StockKind = "resources" | "icons" | "videos";

/**
 * Search the stock library.
 *
 * `resources` pages with `limit`, while `icons` and `videos` page with
 * `per_page` - the same concept under two names, because the three catalogues
 * came from different services. Send whichever the endpoint expects.
 */
export function searchStock(
  kind: StockKind,
  term: string,
  opts: { page?: number; perPage?: number } = {}
) {
  const perPage = opts.perPage ?? 20;
  return call<unknown[]>(`/${kind}`, {
    query: {
      term,
      page: opts.page ?? 1,
      ...(kind === "resources" ? { limit: perPage } : { per_page: perPage }),
    },
  });
}

/**
 * Mint a download URL for one stock item. This is the call that actually
 * consumes a download from the plan's quota - searching is free, downloading
 * is not.
 *
 * All three libraries follow `/{kind}/{id}/download`. Note the filename comes
 * back without an extension for icons (`"coin"`), so callers deriving a name
 * should fall back to the URL's own path.
 */
export function getStockDownload(resourceId: number | string, kind: StockKind = "resources") {
  return call<{ filename: string; url: string }>(`/${kind}/${resourceId}/download`);
}

/* ------------------------------------------------------------------ *
 * AI tasks
 * ------------------------------------------------------------------ */

/**
 * Feature paths, verified against the live API rather than the docs - the
 * published docs list several paths that 404 (`/v1/ai/flux-dev`,
 * `/v1/ai/remove-background`, `/v1/ai/image-styletransfer`) and omit the
 * `/beta/` segment that background removal actually lives behind.
 */
export const MAGNIFIC_FEATURES = {
  // Text to image
  mystic: "/ai/mystic",
  fluxDev: "/ai/text-to-image/flux-dev",
  hyperflux: "/ai/text-to-image/hyperflux",
  seedream: "/ai/text-to-image/seedream-v4-5",
  textToIcon: "/ai/text-to-icon",
  // Image editing
  upscale: "/ai/image-upscaler",
  relight: "/ai/image-relight",
  styleTransfer: "/ai/image-style-transfer",
  expand: "/ai/image-expand/flux-pro",
  // Image to video
  klingPro: "/ai/image-to-video/kling-v2-5-pro",
  hailuo: "/ai/image-to-video/minimax-hailuo-02-1080p",
  omniHuman: "/ai/video/omni-human-1-5",
  // Audio
  soundEffects: "/ai/sound-effects",
} as const;

export type MagnificFeature = keyof typeof MAGNIFIC_FEATURES;

export type TaskState = {
  task_id: string;
  status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error: string | null;
  generated: string[];
};

/**
 * Start an AI task. Pass `webhook_url` in `body` to be told when it finishes
 * instead of polling - see `api/integrations/magnific/callback`.
 */
export function startTask(feature: MagnificFeature, body: Record<string, unknown>) {
  return call<TaskState>(MAGNIFIC_FEATURES[feature], {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getTask(feature: MagnificFeature, taskId: string) {
  return call<TaskState>(`${MAGNIFIC_FEATURES[feature]}/${taskId}`);
}

/**
 * Start a task and wait for it to finish.
 *
 * Only for short jobs. Image generation lands in seconds, but video can run
 * for minutes - well past a serverless function's ceiling - so for video use
 * the webhook instead of this.
 */
export async function runTask(
  feature: MagnificFeature,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<MagnificResult<TaskState>> {
  const started = await startTask(feature, body);
  if (!started.success) return started;

  const timeout = opts.timeoutMs ?? 90_000;
  const interval = opts.intervalMs ?? 2_000;
  const deadline = Date.now() + timeout;
  let state = started.data;

  while (state.status === "CREATED" || state.status === "IN_PROGRESS") {
    if (Date.now() > deadline) {
      // The task keeps running server-side; hand back the id so the caller can
      // pick it up later rather than losing the credits already spent.
      return {
        success: false,
        error: `Timed out after ${Math.round(timeout / 1000)}s (task ${state.task_id} is still running)`,
      };
    }
    await new Promise((r) => setTimeout(r, interval));
    const polled = await getTask(feature, state.task_id);
    if (!polled.success) return polled;
    state = polled.data;
  }

  if (state.status === "FAILED") {
    return { success: false, error: state.error || "Generation failed" };
  }
  return { success: true, data: state };
}

/**
 * Background removal sits on the older beta route and answers synchronously,
 * so it does not go through the task machinery above.
 */
export function removeBackground(imageUrl: string) {
  return call<{ url?: string; original?: string; high_resolution?: string }>(
    "/ai/beta/remove-background",
    { method: "POST", body: JSON.stringify({ image_url: imageUrl }) }
  );
}

/* ------------------------------------------------------------------ *
 * Persisting results
 * ------------------------------------------------------------------ */

/**
 * Copy a Magnific URL into our own S3 bucket and return the permanent key.
 *
 * Call this on every generated asset before storing it. The URLs Magnific
 * returns carry `?token=exp=<unix ts>` and stop resolving within hours - a
 * saved one is a guaranteed broken image, and the credits are already spent by
 * then. Serve the returned key through `/api/media/[...key]` like any other
 * upload, since the bucket is private.
 */
export async function persistToS3(
  sourceUrl: string,
  folder = "ai-generated",
  userId?: string
): Promise<MagnificResult<{ key: string; url: string }>> {
  if (!isS3Configured()) return { success: false, error: "S3 is not configured" };
  try {
    const res = await fetch(sourceUrl, { cache: "no-store" });
    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        error: `Could not fetch result (HTTP ${res.status})`,
      };
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());

    // The signed URL's path carries the real extension; its query string must
    // not become part of the filename.
    const name = new URL(sourceUrl).pathname.split("/").pop() || "result";
    const key = generateFileKey(folder, name, userId);

    const up = await uploadFile(key, buffer, contentType);
    if (!up.success || !up.url) return { success: false, error: up.error || "Upload failed" };
    return { success: true, data: { key, url: up.url } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------ *
 * Webhook verification
 * ------------------------------------------------------------------ */

/**
 * Verify a webhook callback.
 *
 * The signature covers `{id}.{timestamp}.{raw body}` under HMAC-SHA256, base64.
 * The header holds space-separated versioned entries (`v1,<sig> v2,<sig>`), so
 * accept a match on any of them.
 *
 * `rawBody` must be the exact bytes received - `JSON.parse` then `stringify`
 * reorders keys and the signature will never match.
 */
export function verifyWebhookSignature(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  secret: string,
  toleranceSeconds = 300
): { ok: boolean; reason?: string } {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "Missing webhook headers" };
  if (!secret) return { ok: false, reason: "MAGNIFIC_WEBHOOK_SECRET is not set" };

  // Reject stale deliveries so a captured callback cannot be replayed later.
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(Date.now() / 1000 - sent) > toleranceSeconds) {
    return { ok: false, reason: "Timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const entry of signature.split(" ")) {
    const provided = entry.includes(",") ? entry.split(",")[1] : entry;
    const providedBuf = Buffer.from(provided);
    // timingSafeEqual throws on a length mismatch, which is itself a non-match.
    if (providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "Signature mismatch" };
}
